package compose

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/BitterSecurity/Decepticon/clients/launcher/internal/config"
	"github.com/BitterSecurity/Decepticon/clients/launcher/internal/health"
	"github.com/BitterSecurity/Decepticon/clients/launcher/internal/runtime"
)

func portRecoveryProcess(args []string) int {
	for _, arg := range args {
		if arg == "config" {
			if os.Getenv("DECEPTICON_PORT_TEST_FIXED") == "1" {
				os.Setenv("LANGGRAPH_PORT", os.Getenv("DECEPTICON_PORT_TEST_ORIGINAL"))
			}
			fmt.Printf(`{"services":{"langgraph":{"ports":[{"host_ip":"127.0.0.1","published":%q,"target":2024,"protocol":"tcp"}]}}}`, os.Getenv("LANGGRAPH_PORT"))
			return 0
		}
		if arg == "up" {
			if os.Getenv("LANGGRAPH_PORT") == os.Getenv("DECEPTICON_PORT_TEST_ORIGINAL") {
				fmt.Fprintf(os.Stderr, "Error response from daemon: Bind for 127.0.0.1:%s failed: port is already allocated\n", os.Getenv("LANGGRAPH_PORT"))
				return 1
			}
			return 0
		}
	}
	return 99
}

func TestPortRecoveryPersistsAndRewiresStartup(t *testing.T) {
	occupied, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer occupied.Close()
	port := strconv.Itoa(occupied.Addr().(*net.TCPAddr).Port)
	nextOccupied, err := net.Listen("tcp4", "127.0.0.1:"+strconv.Itoa(occupied.Addr().(*net.TCPAddr).Port+1))
	if err != nil {
		t.Skip("could not reserve consecutive test ports")
	}
	defer nextOccupied.Close()
	t.Setenv("LANGGRAPH_PORT", port)
	t.Setenv("DECEPTICON_PORT_TEST_ORIGINAL", port)
	t.Setenv("DECEPTICON_PORT_TEST_HELPER", "1")
	home := t.TempDir()
	path := filepath.Join(home, ".env")
	original := "# preserve comment\nTOKEN='synthetic-test-value'\nLANGGRAPH_PORT=" + port + "\n"
	if err := os.WriteFile(path, []byte(original), 0600); err != nil {
		t.Fatal(err)
	}
	c := &Compose{Home: home, ComposeFile: filepath.Join(home, "compose.yml"), EnvFile: path, Runtime: runtime.Runtime{Name: "docker", Bin: os.Args[0]}}
	if err := c.Up(Profiles.CLI); err != nil {
		t.Fatal(err)
	}
	env, err := config.LoadEnv(path)
	if err != nil {
		t.Fatal(err)
	}
	next, _ := strconv.Atoi(env["LANGGRAPH_PORT"])
	if first, _ := strconv.Atoi(port); next <= first+1 {
		t.Fatalf("port did not advance: %v", env)
	}
	data, _ := os.ReadFile(path)
	if !strings.Contains(string(data), "# preserve comment\nTOKEN='synthetic-test-value'") {
		t.Fatal("lost env content")
	}
	loaded := map[string]string{"LANGGRAPH_PORT": port}
	c.RefreshPorts(loaded)
	if loaded["LANGGRAPH_PORT"] != strconv.Itoa(next) || os.Getenv("LANGGRAPH_PORT") != strconv.Itoa(next) {
		t.Fatal("stale startup wiring")
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/assistants/search" {
			fmt.Fprint(w, `[{"graph_id":"decepticon"}]`)
		} else {
			fmt.Fprint(w, `{}`)
		}
	}))
	defer server.Close()
	// The helper reports a successful Docker up without keeping a container
	// socket open. Do not assume its released probe port stays available: on
	// macOS the ephemeral allocator can reuse it before this assertion. Keep
	// our HTTP fixture's listener owned and verify the remapped destination at
	// the transport boundary before routing to that fixture.
	previousTransport := http.DefaultTransport
	transport := http.DefaultTransport.(*http.Transport).Clone()
	dial := &net.Dialer{}
	transport.DialContext = func(ctx context.Context, network, address string) (net.Conn, error) {
		if address != net.JoinHostPort("127.0.0.1", strconv.Itoa(next)) {
			return nil, fmt.Errorf("stale host probe destination: %s", address)
		}
		return dial.DialContext(ctx, network, server.Listener.Addr().String())
	}
	http.DefaultTransport = transport
	t.Cleanup(func() { http.DefaultTransport = previousTransport; transport.CloseIdleConnections() })
	if err := health.ProbeLangGraph(context.Background(), loaded); err != nil {
		t.Fatal(err)
	}
	if err := c.Up(Profiles.CLI); err != nil {
		t.Fatal(err)
	}
	again, _ := config.LoadEnv(path)
	if again["LANGGRAPH_PORT"] != strconv.Itoa(next) {
		t.Fatal("restart changed saved port")
	}
}

func TestAllocatedPortRequiresActualLoopbackBindError(t *testing.T) {
	for _, message := range []string{"Bind for 0.0.0.0:7474 failed: port is already allocated", "unhealthy container", "port 7474 permission denied"} {
		if allocatedPort.MatchString(message) {
			t.Fatalf("unsafe match: %s", message)
		}
	}
}

func TestLiveDockerPortRecovery(t *testing.T) {
	if os.Getenv("DECEPTICON_LIVE_PORT_TEST") != "1" {
		t.Skip("set DECEPTICON_LIVE_PORT_TEST=1 for real Docker")
	}
	t.Setenv("DECEPTICON_COMPOSE_PROJECT", "decepticon-port-recovery-test")
	t.Setenv("DECEPTICON_STACK_NAME", "port-recovery-test")
	t.Setenv("NEO4J_HTTP_PORT", "7474")
	// Use an existing listener, or occupy 7474 ourselves on a free host.
	if listener, err := net.Listen("tcp4", "127.0.0.1:7474"); err == nil {
		defer listener.Close()
	}
	home := t.TempDir()
	path := filepath.Join(home, ".env")
	if err := os.WriteFile(path, []byte("NEO4J_HTTP_PORT=7474\n"), 0600); err != nil {
		t.Fatal(err)
	}
	yaml := `services:
  neo4j:
    image: ghcr.io/bittersecurity/decepticon-langgraph:1.6.0
    entrypoint: ["python", "-m", "http.server", "7474"]
    ports:
      - "127.0.0.1:${NEO4J_HTTP_PORT:-7474}:7474"
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:7474')"]
      interval: 1s
      timeout: 3s
      retries: 20
`
	composePath := filepath.Join(home, "compose.yml")
	if err := os.WriteFile(composePath, []byte(yaml), 0600); err != nil {
		t.Fatal(err)
	}
	c := &Compose{Home: home, ComposeFile: composePath, EnvFile: path, Runtime: runtime.Runtime{Name: "docker", Bin: "docker", ComposeArgs: []string{"compose"}}}
	defer func() {
		if err := c.Down(); err != nil {
			t.Error(err)
		}
	}()
	started := time.Now()
	if err := c.Up(); err != nil {
		t.Fatal(err)
	}
	env, _ := config.LoadEnv(path)
	if env["NEO4J_HTTP_PORT"] == "7474" {
		t.Fatal("expected occupied 7474 to remap")
	}
	client := http.Client{Timeout: 3 * time.Second}
	response, err := client.Get("http://127.0.0.1:" + env["NEO4J_HTTP_PORT"])
	if err != nil {
		t.Fatal(err)
	}
	response.Body.Close()
	if response.StatusCode != 200 {
		t.Fatal(response.Status)
	}
	if err := c.Up(); err != nil {
		t.Fatal(err)
	}
	again, _ := config.LoadEnv(path)
	if again["NEO4J_HTTP_PORT"] != env["NEO4J_HTTP_PORT"] {
		t.Fatal("restart drift")
	}
	t.Logf("real Docker remapped 7474 -> %s, HTTP 200, restart stable; elapsed=%s", env["NEO4J_HTTP_PORT"], time.Since(started))
}

func TestPortRecoveryRejectsHardcodedOverlayWithoutEditingEnv(t *testing.T) {
	t.Setenv("LANGGRAPH_PORT", "23456")
	t.Setenv("DECEPTICON_PORT_TEST_ORIGINAL", "23456")
	t.Setenv("DECEPTICON_PORT_TEST_FIXED", "1")
	t.Setenv("DECEPTICON_PORT_TEST_HELPER", "1")
	path := filepath.Join(t.TempDir(), ".env")
	original := "LANGGRAPH_PORT=23456\n"
	if err := os.WriteFile(path, []byte(original), 0600); err != nil {
		t.Fatal(err)
	}
	c := &Compose{EnvFile: path, Runtime: runtime.Runtime{Name: "docker", Bin: os.Args[0]}}
	err := c.Up(Profiles.CLI)
	if err == nil || !strings.Contains(err.Error(), "does not control this binding") {
		t.Fatalf("unexpected error: %v", err)
	}
	saved, _ := os.ReadFile(path)
	if string(saved) != original || os.Getenv("LANGGRAPH_PORT") != "23456" {
		t.Fatal("edited a hardcoded binding")
	}
}

func TestPortRecoveryDoesNotWrapPast65535(t *testing.T) {
	t.Setenv("LANGGRAPH_PORT", "65535")
	t.Setenv("DECEPTICON_PORT_TEST_ORIGINAL", "65535")
	t.Setenv("DECEPTICON_PORT_TEST_HELPER", "1")
	path := filepath.Join(t.TempDir(), ".env")
	original := "LANGGRAPH_PORT=65535\n"
	if err := os.WriteFile(path, []byte(original), 0600); err != nil {
		t.Fatal(err)
	}
	c := &Compose{EnvFile: path, Runtime: runtime.Runtime{Name: "docker", Bin: os.Args[0]}}
	err := c.Up(Profiles.CLI)
	if err == nil || !strings.Contains(err.Error(), "no available host port") {
		t.Fatalf("unexpected error: %v", err)
	}
	saved, _ := os.ReadFile(path)
	if string(saved) != original {
		t.Fatal("changed exhausted configuration")
	}
}
