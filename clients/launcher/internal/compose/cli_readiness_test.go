package compose

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/BitterSecurity/Decepticon/clients/launcher/internal/health"
	"github.com/BitterSecurity/Decepticon/clients/launcher/internal/runtime"
)

func TestCLIReadinessProcess(t *testing.T) {
	if os.Getenv("DECEPTICON_CLI_PROBE_TEST") != "1" {
		return
	}
	for i, arg := range os.Args {
		if arg != "exec" {
			continue
		}
		args := os.Args[i+1:]
		if len(args) != 7 || strings.Join(args[:4], " ") != "-T cli node -e" {
			fmt.Fprintln(os.Stderr, "unexpected probe command")
			os.Exit(2)
		}
		if args[4] != cliReadinessScript || args[6] != "1048576" {
			fmt.Fprintln(os.Stderr, "unexpected probe script or catalog bound")
			os.Exit(2)
		}
		if os.Getenv("DECEPTICON_CLI_PROBE_BLOCK") == "1" {
			time.Sleep(30 * time.Second)
		}
		fmt.Print(os.Getenv("DECEPTICON_CLI_PROBE_BODY"))
		os.Exit(0)
	}
	os.Exit(2)
}

// The script runs in Linux inside the CLI container in production. Exercise it
// directly here so host Node startup (notably Windows cold starts) is outside
// the Docker-exec budget tested separately below. Its request watchdog stays 5s.
func TestCLIReadinessScriptUsesConfiguredConsumerAndRejectsInvalidResponses(t *testing.T) {
	for _, tc := range []struct {
		name, body, want string
		status           int
	}{
		{"ready", `[{"graph_id":"decepticon"}]`, "", 200},
		{"wrong graph", `[{"graph_id":"other","name":"decepticon"}]`, "not registered", 200},
		{"invalid JSON", `broken`, "invalid assistant catalog", 200},
		{"unauthorized", `[]`, "HTTP 401", 401},
		{"redirect", `[]`, "HTTP 302", 302},
		{"oversized", strings.Repeat("x", (1<<20)+1), "exceeds", 200},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var calls atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls.Add(1)
				if r.URL.Path == "/custom/ok" {
					w.WriteHeader(tc.status)
					return
				}
				if r.URL.Path != "/custom/assistants/search" || r.Method != "POST" {
					t.Errorf("wrong consumer request: %s %s", r.Method, r.URL.Path)
				}
				fmt.Fprint(w, tc.body)
			}))
			defer server.Close()
			t.Setenv("DECEPTICON_API_URL", server.URL+"/custom/")
			ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
			defer cancel()
			body, err := exec.CommandContext(ctx, "node", "-e", cliReadinessScript, "5000", "1048576").CombinedOutput()
			if err != nil {
				err = fmt.Errorf("script: %w: %s", err, body)
			} else {
				err = health.ValidateAssistantCatalog(body)
			}
			if tc.want == "" {
				if err != nil || calls.Load() != 2 {
					t.Fatalf("ready probe: calls=%d err=%v", calls.Load(), err)
				}
			} else if err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("want %q, got %v", tc.want, err)
			}
		})
	}
}

func TestProbeCLIHonorsCancellationAndDeadline(t *testing.T) {
	t.Setenv("DECEPTICON_CLI_PROBE_TEST", "1")
	c := &Compose{Home: t.TempDir(), Runtime: runtime.Runtime{Bin: os.Args[0], ComposeArgs: []string{"-test.run=TestCLIReadinessProcess", "--"}}}
	t.Setenv("DECEPTICON_CLI_PROBE_BLOCK", "1")
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	start := time.Now()
	if err := c.ProbeCLI(ctx); err == nil {
		t.Fatal("hanging consumer accepted")
	}
	if elapsed := time.Since(start); elapsed > 2*time.Second {
		t.Fatalf("deadline overrun: %v", elapsed)
	}
	ctx, cancel = context.WithCancel(context.Background())
	cancel()
	if err := c.ProbeCLI(ctx); err != context.Canceled {
		t.Fatalf("cancelled probe: %v", err)
	}
}

func TestProbeCLICommandAndCatalog(t *testing.T) {
	t.Setenv("DECEPTICON_CLI_PROBE_TEST", "1")
	t.Setenv("GORACE", "atexit_sleep_ms=0")
	c := &Compose{Home: t.TempDir(), Runtime: runtime.Runtime{Bin: os.Args[0], ComposeArgs: []string{"-test.run=TestCLIReadinessProcess", "--"}}}
	for _, body := range []string{`[{"graph_id":"decepticon"}]`, `[{"graph_id":"other","name":"decepticon"}]`, `invalid`} {
		t.Setenv("DECEPTICON_CLI_PROBE_BODY", body)
		err := c.ProbeCLI(context.Background())
		if (err == nil) != (body == `[{"graph_id":"decepticon"}]`) {
			t.Fatalf("catalog %q: %v", body, err)
		}
	}
}

func TestCLIReadinessScriptBoundsHangingRequest(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { calls.Add(1); <-r.Context().Done() }))
	defer server.Close()
	t.Setenv("DECEPTICON_API_URL", server.URL)
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	body, err := exec.CommandContext(ctx, "node", "-e", cliReadinessScript, "1000", "1048576").CombinedOutput()
	if err == nil || ctx.Err() != nil || calls.Load() != 1 || !strings.Contains(string(body), "CLI API request timed out") {
		t.Fatalf("hanging request: calls=%d err=%v context=%v output=%s", calls.Load(), err, ctx.Err(), body)
	}
}
