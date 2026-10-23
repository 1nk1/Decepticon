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
// LangGraph thread id via /threads/search plus state inspection: the
// engagement identity lives in the thread *state values*, not in thread
// metadata, so candidates are checked one state call at a time.
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
		if strings.EqualFold(state.EngagementName, engagement) {
			return state.ThreadID, nil
		}
	}
	return "", fmt.Errorf("no thread found for engagement %q", engagement)
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
			EngagementName   string             `json:"engagement_name"`
			Messages         []rawMessage       `json:"messages"`
			PlanRevision     int                `json:"plan_revision"`
			WorkflowSnapshot map[string]any     `json:"workflow_snapshot"`
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
		HasWorkflowPlan: payload.Values.WorkflowSnapshot != nil,
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

// ReplayLimit returns the trailing window of messages to print.
func ReplayLimit(messages []TranscriptMessage, limit int) []TranscriptMessage {
	if limit <= 0 || limit >= len(messages) {
		return messages
	}
	return messages[len(messages)-limit:]
}

// DefaultLogsClient is the HTTP client used by the logs command (bounded so
// a stalled API cannot hang the CLI).
func DefaultLogsClient() *http.Client {
	return &http.Client{Timeout: 30 * time.Second}
}
