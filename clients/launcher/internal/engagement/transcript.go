package engagement

// Transcript access for detached engagements: resolve an engagement (or an
// explicit thread id) to its LangGraph thread, then replay the conversation
// transcript from the thread state — the same surface the MCP
// `decepticon_transcript` tool reads, exposed to the host CLI.

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// TranscriptMessage is one replayable conversation entry.
type TranscriptMessage struct {
	Role    string // "user", "assistant", "tool", …
	Content string // best-effort text rendering of the message content
}

// ThreadState carries what `decepticon logs` replays and what later
// engagement-facing commands (doctor/cancel) need from the run.
type ThreadState struct {
	ThreadID        string
	EngagementName  string
	Messages        []TranscriptMessage
	PlanRevision    int
	HasWorkflowPlan bool
}

// ResolveThreadID maps an engagement name (or an explicit thread id) to a
// LangGraph thread id via /threads/search plus per-candidate checks: the
// identity anchor is the newest run's input engagement_name, falling back
// to the thread state's values copy.
func ResolveThreadID(ctx context.Context, client *http.Client, baseURL, engagement string) (string, error) {
	engagement = strings.TrimSpace(engagement)
	if engagement == "" {
		return "", fmt.Errorf("engagement name or thread id is required")
	}
	if isThreadIDShape(engagement) {
		// An explicit thread id skips the search entirely.
		state, err := FetchThreadState(ctx, client, baseURL, engagement)
		if err != nil {
			return "", err
		}
		return state.ThreadID, nil
	}

	ids, err := searchThreadIDs(ctx, client, baseURL)
	if err != nil {
		return "", err
	}
	for _, id := range ids {
		state, err := FetchThreadState(ctx, client, baseURL, id)
		if err != nil {
			continue // unreadable thread — try the next candidate
		}
		// The run's input engagement_name is the authoritative identity: the
		// thread state's copy is mutable — when a workspace's plan documents
		// are shared (the server workspace-mapping override), the OPPLAN
		// middleware reduces the plan document's name into the state, and a
		// later engagement's thread then claims the earlier engagement's
		// name. Verified against a live stack: two threads, one plan.
		stateName := state.EngagementName
		if runName, runErr := latestRunEngagementName(ctx, client, baseURL, id); runErr == nil && runName != "" {
			stateName = runName
		}
		if strings.EqualFold(stateName, engagement) {
			return state.ThreadID, nil
		}
	}
	return "", fmt.Errorf("no thread found for engagement %q", engagement)
}

// latestRunEngagementName reads the thread's newest run input and returns
// its engagement_name ("" when absent — e.g. CLI attach runs that carry no
// engagement in their input).
func latestRunEngagementName(ctx context.Context, client *http.Client, baseURL, threadID string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		fmt.Sprintf("%s/threads/%s/runs?limit=1", strings.TrimRight(baseURL, "/"), threadID), nil)
	if err != nil {
		return "", err
	}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("run list returned HTTP %d", resp.StatusCode)
	}
	var runs []struct {
		Kwargs struct {
			Input struct {
				EngagementName string `json:"engagement_name"`
			} `json:"input"`
		} `json:"kwargs"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 4<<20)).Decode(&runs); err != nil {
		return "", err
	}
	if len(runs) == 0 {
		return "", nil
	}
	return strings.TrimSpace(runs[0].Kwargs.Input.EngagementName), nil
}

// isThreadIDShape matches LangGraph thread ids (UUID v4, e.g.
// 01a16679-e6af-…) so an explicit id is never mistaken for an engagement
// name — engagement labels allow hex-and-dash strings too, so the check is
// deliberately strict about length and dash placement.
func isThreadIDShape(value string) bool {
	if len(value) != 36 || strings.Count(value, "-") != 4 {
		return false
	}
	for _, r := range value {
		if !(r >= '0' && r <= '9') && !(r >= 'a' && r <= 'f') && r != '-' {
			return false
		}
	}
	return true
}

func searchThreadIDs(ctx context.Context, client *http.Client, baseURL string) ([]string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(baseURL, "/")+"/threads/search",
		strings.NewReader(`{"limit": 100}`))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("thread search: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("thread search returned HTTP %d", resp.StatusCode)
	}
	var threads []struct {
		ThreadID string `json:"thread_id"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 8<<20)).Decode(&threads); err != nil {
		return nil, fmt.Errorf("thread search reply: %w", err)
	}
	ids := make([]string, 0, len(threads))
	for _, t := range threads {
		if t.ThreadID != "" {
			ids = append(ids, t.ThreadID)
		}
	}
	return ids, nil
}

// FetchThreadState reads /threads/{id}/state and extracts the engagement
// name, replayable messages and plan metadata.
func FetchThreadState(ctx context.Context, client *http.Client, baseURL, threadID string) (*ThreadState, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		fmt.Sprintf("%s/threads/%s/state", strings.TrimRight(baseURL, "/"), threadID), nil)
	if err != nil {
		return nil, err
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("thread state: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("thread state returned HTTP %d", resp.StatusCode)
	}
	var payload struct {
		Values struct {
			EngagementName string       `json:"engagement_name"`
			Messages       []rawMessage `json:"messages"`
			PlanRevision   int          `json:"plan_revision"`
			// WorkflowSnapshot is persisted as a JSON string in some graphs
			// and as an object in others — capture it raw and only check
			// presence (measured live: it is a string).
			WorkflowSnapshot json.RawMessage `json:"workflow_snapshot"`
		} `json:"values"`
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 32<<20))
	if err != nil {
		return nil, err
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, fmt.Errorf("thread state reply: %w", err)
	}
	state := &ThreadState{
		ThreadID:        threadID,
		EngagementName:  payload.Values.EngagementName,
		PlanRevision:    payload.Values.PlanRevision,
		HasWorkflowPlan: len(payload.Values.WorkflowSnapshot) > 0 && string(payload.Values.WorkflowSnapshot) != "null",
	}
	for _, m := range payload.Values.Messages {
		state.Messages = append(state.Messages, TranscriptMessage{Role: m.Type, Content: m.renderedText()})
	}
	return state, nil
}

// rawMessage tolerates both content shapes the graph persists — a plain
// string and the provider-style part list.
type rawMessage struct {
	Type    string          `json:"type"`
	Content json.RawMessage `json:"content"`
}

func (m rawMessage) renderedText() string {
	var text string
	if err := json.Unmarshal(m.Content, &text); err == nil {
		return text
	}
	var parts []map[string]any
	if err := json.Unmarshal(m.Content, &parts); err == nil {
		var b strings.Builder
		for _, part := range parts {
			switch part["type"] {
			case "text":
				if s, ok := part["text"].(string); ok {
					b.WriteString(s)
				}
			case "tool_use":
				name, _ := part["name"].(string)
				b.WriteString("[tool_use: " + name + "]")
			case "tool_result":
				b.WriteString("[tool_result]")
			}
		}
		return b.String()
	}
	return ""
}

// ReplayLimit returns the trailing window of messages to print, skipping
// contentless entries (tool-call-only assistant chunks render empty).
func ReplayLimit(messages []TranscriptMessage, limit int) []TranscriptMessage {
	rendered := make([]TranscriptMessage, 0, len(messages))
	for _, message := range messages {
		if strings.TrimSpace(message.Content) == "" && message.Role == "ai" {
			continue
		}
		rendered = append(rendered, message)
	}
	if limit <= 0 || limit >= len(rendered) {
		return rendered
	}
	return rendered[len(rendered)-limit:]
}

// DefaultLogsClient is the HTTP client used by the logs command (bounded so
// a stalled API cannot hang the CLI).
func DefaultLogsClient() *http.Client {
	return &http.Client{Timeout: 30 * time.Second}
}
