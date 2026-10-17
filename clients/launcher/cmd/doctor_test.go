package cmd

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/spf13/cobra"
)

func TestDoctorHTTPReportsFailureForNonSuccess(t *testing.T) {
	for _, status := range []int{200, 401, 503} {
		t.Run(http.StatusText(status), func(t *testing.T) {
			// Given a real HTTP endpoint with a known status.
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(status) }))
			defer server.Close()
			// When the diagnostics probe reaches it.
			ok := doctorHTTP(context.Background(), server.Client(), server.URL)
			// Then only a healthy HTTP response succeeds.
			if ok != (status == 200) {
				t.Fatalf("status %d: ok=%v", status, ok)
			}
		})
	}
}

func TestDoctorHTTPCancelledProbe(t *testing.T) {
	// Given a cancelled diagnostic request.
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	// When the probe is invoked.
	ok := doctorHTTP(ctx, &http.Client{Timeout: time.Second}, "http://127.0.0.1:1")
	// Then cancellation is a failed check.
	if ok {
		t.Fatal("cancelled probe succeeded")
	}
}

func TestResumeEnvironmentRoutesSelection(t *testing.T) {
	for _, tc := range []struct {
		name, thread, key, value string
		latest                   bool
	}{
		{name: "new"},
		{name: "picker", thread: "picker", key: "DECEPTICON_RESUME_PICKER", value: "true"},
		{name: "id", thread: "thread-123", key: "DECEPTICON_THREAD_ID", value: "thread-123"},
		{name: "latest", latest: true, key: "DECEPTICON_RESUME_LATEST", value: "true"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			// Given the user's resume selection.
			env := map[string]string{}
			// When translating it for the container entrypoint.
			applyResumeEnv(env, tc.thread, tc.latest)
			// Then exactly the intended resume route is exported.
			if tc.key == "" {
				if len(env) != 0 {
					t.Fatalf("unexpected resume: %v", env)
				}
				return
			}
			if len(env) != 1 || env[tc.key] != tc.value {
				t.Fatalf("wrong resume route: %v", env)
			}
		})
	}
}

func TestRootAcceptsPositionalResumeID(t *testing.T) {
	// Given the actual Cobra root with startup replaced at its side-effect boundary.
	previousRun := rootCmd.RunE
	previousResume := resumeThread
	t.Cleanup(func() {
		rootCmd.RunE = previousRun
		resumeThread = previousResume
		rootCmd.SetArgs(nil)
		rootCmd.PersistentFlags().Lookup("resume").Changed = false
	})
	var received []string
	rootCmd.RunE = func(_ *cobra.Command, args []string) error { received = args; return nil }
	rootCmd.SetArgs([]string{"--resume", "thread-123"})
	// When parsing a positional resume ID.
	err := rootCmd.Execute()
	// Then startup receives the ID and picker sentinel for resolution.
	if err != nil || len(received) != 1 || received[0] != "thread-123" || resumeThread != "picker" {
		t.Fatalf("resume parse: args=%v value=%q error=%v", received, resumeThread, err)
	}
}
