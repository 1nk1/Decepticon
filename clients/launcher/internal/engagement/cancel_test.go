package engagement

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func newFakeLangGraph(t *testing.T, runs []map[string]any, cancelStatus int, cancelled *bool) *httptest.Server {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/threads/search" && r.Method == http.MethodPost:
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`[{"thread_id": "01a16679-e6af-4d09-a238-57ae6af4e79c"}]`))
		case r.URL.Path == "/threads/01a16679-e6af-4d09-a238-57ae6af4e79c/state" && r.Method == http.MethodGet:
			w.Header().Set("Content-Type", "application/json")
			// The state's engagement_name is deliberately WRONG here (a
			// shared plan document overwrote it, as happens under the
			// server workspace-mapping override) — resolution must win via
			// the run's input name.
			_, _ = w.Write([]byte(`{"values": {"engagement_name": "release-verify-1059", "messages": []}}`))
		case r.URL.Path == "/threads/01a16679-e6af-4d09-a238-57ae6af4e79c/runs" && r.Method == http.MethodGet:
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(runs)
		case r.URL.Path == "/threads/01a16679-e6af-4d09-a238-57ae6af4e79c/runs/run-active/cancel" && r.Method == http.MethodPost:
			*cancelled = true
			w.WriteHeader(cancelStatus)
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(server.Close)
	return server
}

func mustRuns(t *testing.T, body string) []map[string]any {
	t.Helper()
	var runs []map[string]any
	if err := json.Unmarshal([]byte(body), &runs); err != nil {
		t.Fatal(err)
	}
	return runs
}

func TestFindActiveRunPicksTheNewestCancellableRun(t *testing.T) {
	server := newFakeLangGraph(t, mustRuns(t, `[
		{"run_id": "run-done", "status": "success", "assistant_id": "a1", "kwargs": {"input": {"engagement_name": "cancel-verify"}}},
		{"run_id": "run-active", "status": "running", "assistant_id": "a2", "kwargs": {"input": {"engagement_name": "cancel-verify"}}},
		{"run_id": "run-pending", "status": "pending", "assistant_id": "a3", "kwargs": {"input": {"engagement_name": "cancel-verify"}}}
	]`), http.StatusNoContent, new(bool))

	run, err := FindActiveRun(context.Background(), server.Client(), server.URL,
		"01a16679-e6af-4d09-a238-57ae6af4e79c")
	if err != nil {
		t.Fatal(err)
	}
	// The API returns newest first; the finished run is skipped.
	if run == nil || run.RunID != "run-active" || run.Status != "running" {
		t.Fatalf("unexpected active run: %+v", run)
	}
}

func TestFindActiveRunReturnsNilWhenNothingRuns(t *testing.T) {
	server := newFakeLangGraph(t, mustRuns(t, `[
		{"run_id": "run-done", "status": "error", "assistant_id": "a1"}
	]`), http.StatusNoContent, new(bool))

	run, err := FindActiveRun(context.Background(), server.Client(), server.URL,
		"01a16679-e6af-4d09-a238-57ae6af4e79c")
	if err != nil {
		t.Fatal(err)
	}
	if run != nil {
		t.Fatalf("expected no active run, got %+v", run)
	}
}

func TestCancelRunAccepts204AndSurfacesErrors(t *testing.T) {
	cancelled := new(bool)
	server := newFakeLangGraph(t, nil, http.StatusNoContent, cancelled)

	if err := CancelRun(context.Background(), server.Client(), server.URL,
		"01a16679-e6af-4d09-a238-57ae6af4e79c", "run-active"); err != nil {
		t.Fatalf("204 cancel should succeed: %v", err)
	}
	if !*cancelled {
		t.Fatal("cancel endpoint was never called")
	}

	denied := newFakeLangGraph(t, nil, http.StatusForbidden, new(bool))
	err := CancelRun(context.Background(), denied.Client(), denied.URL,
		"01a16679-e6af-4d09-a238-57ae6af4e79c", "run-active")
	if err == nil || !strings.Contains(err.Error(), "403") {
		t.Fatalf("expected an HTTP 403 error, got %v", err)
	}
}

func TestResolveThreadIDTrustsRunInputOverStateName(t *testing.T) {
	// Regression for the live-stack finding: under the server
	// workspace-mapping override a shared plan document reduces the
	// earlier engagement's name into a later engagement's thread state —
	// resolution must anchor on the run input instead.
	server := newFakeLangGraph(t, mustRuns(t, `[
		{"run_id": "run-active", "status": "running", "assistant_id": "a2", "kwargs": {"input": {"engagement_name": "cancel-verify"}}}
	]`), http.StatusNoContent, new(bool))

	threadID, err := ResolveThreadID(context.Background(), server.Client(), server.URL, "cancel-verify")
	if err != nil {
		t.Fatalf("resolution failed: %v", err)
	}
	if threadID != "01a16679-e6af-4d09-a238-57ae6af4e79c" {
		t.Fatalf("resolved to %q", threadID)
	}
	// The overwritten state name must NOT resolve.
	if _, err := ResolveThreadID(context.Background(), server.Client(), server.URL, "release-verify-1059"); err == nil {
		t.Fatal("the state-overwritten name must not resolve to this thread")
	}
}
