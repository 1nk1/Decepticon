package engagement

// Per-engagement cancellation: resolve the engagement's thread, find its
// active run, and cancel it through the LangGraph API — the host-side
// counterpart of the MCP `decepticon_cancel_engagement` tool (issue #1041,
// slice 3).

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// RunHandle is one run of the engagement's thread.
type RunHandle struct {
	RunID     string
	Status    string
	Assistant string
}

// Active statuses per the LangGraph runs API: a run in one of these states
// can still be cancelled.
var cancellableStatuses = map[string]bool{
	"pending":    true,
	"running":    true,
	"cancelling": true,
}

// FindActiveRun returns the thread's newest cancellable run, or nil when
// nothing is running.
func FindActiveRun(ctx context.Context, client *http.Client, baseURL, threadID string) (*RunHandle, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		fmt.Sprintf("%s/threads/%s/runs?limit=10", strings.TrimRight(baseURL, "/"), threadID), nil)
	if err != nil {
		return nil, err
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("run list: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("run list returned HTTP %d", resp.StatusCode)
	}
	var runs []struct {
		RunID     string `json:"run_id"`
		Status    string `json:"status"`
		Assistant string `json:"assistant_id"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 4<<20)).Decode(&runs); err != nil {
		return nil, fmt.Errorf("run list reply: %w", err)
	}
	for _, r := range runs {
		if cancellableStatuses[r.Status] {
			return &RunHandle{RunID: r.RunID, Status: r.Status, Assistant: r.Assistant}, nil
		}
	}
	return nil, nil
}

// CancelRun cancels a specific run. The API answers 204 on success; any
// other status is an error carrying the body for diagnosis.
func CancelRun(ctx context.Context, client *http.Client, baseURL, threadID, runID string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		fmt.Sprintf("%s/threads/%s/runs/%s/cancel", strings.TrimRight(baseURL, "/"), threadID, runID), nil)
	if err != nil {
		return err
	}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("run cancel: %w", err)
	}
	defer resp.Body.Close()
	// The API answers 202 Accepted (the cancellation is queued) as well as
	// 200/204 — all three mean the cancel was accepted.
	switch resp.StatusCode {
	case http.StatusAccepted, http.StatusOK, http.StatusNoContent:
		return nil
	}
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
	return fmt.Errorf("run cancel returned HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
}
