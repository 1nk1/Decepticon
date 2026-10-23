package cmd

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/BitterSecurity/Decepticon/clients/launcher/internal/compose"
	"github.com/BitterSecurity/Decepticon/clients/launcher/internal/health"
	"github.com/BitterSecurity/Decepticon/clients/launcher/internal/runtime"
)

func TestStartupCLIProbeProcess(t *testing.T) {
	if os.Getenv("DECEPTICON_STARTUP_PROBE_TEST") != "1" {
		return
	}
	fmt.Print(os.Getenv("DECEPTICON_STARTUP_PROBE_BODY"))
	os.Exit(0)
}

func TestStartupReadinessChecksSelectedConsumer(t *testing.T) {
	t.Setenv("DECEPTICON_STARTUP_TIMEOUT_SECONDS", "")
	t.Setenv("DECEPTICON_STARTUP_PROBE_TEST", "1")
	t.Setenv("GORACE", "atexit_sleep_ms=0")
	// The absolute test executable needs no external tools. Keep inherited WSL
	// clipboard-tool PATH discovery outside the readiness deadline under test.
	t.Setenv("PATH", t.TempDir())
	oldTimeout, oldPoll := health.LangGraphTimeout, health.PollInterval
	health.LangGraphTimeout, health.PollInterval = 500*time.Millisecond, 5*time.Millisecond
	defer func() { health.LangGraphTimeout, health.PollInterval = oldTimeout, oldPoll }()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { fmt.Fprint(w, `[{"graph_id":"decepticon"}]`) }))
	defer server.Close()
	c := &compose.Compose{Home: t.TempDir(), Runtime: runtime.Runtime{Bin: os.Args[0], ComposeArgs: []string{"-test.run=TestStartupCLIProbeProcess", "--"}}}
	for _, tc := range []struct {
		name, mode, port, body string
		wantOK                 bool
	}{
		{"CLI works with unreachable host", "", "invalid-host", `[{"graph_id":"decepticon"}]`, true},
		{"serve still requires host", "engagement", "invalid-host", `[{"graph_id":"decepticon"}]`, false},
		{"CLI failure cannot use healthy host", "", strings.TrimPrefix(server.URL, "http://127.0.0.1:"), `[]`, false},
		{"serve does not require CLI", "engagement", strings.TrimPrefix(server.URL, "http://127.0.0.1:"), `[]`, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("LANGGRAPH_PORT", tc.port)
			t.Setenv("DECEPTICON_STARTUP_PROBE_BODY", tc.body)
			err := waitForStartupServices(context.Background(), c, nil, tc.mode)
			if (err == nil) != tc.wantOK {
				t.Fatalf("ready=%v want=%v error=%v", err == nil, tc.wantOK, err)
			}
		})
	}
}
