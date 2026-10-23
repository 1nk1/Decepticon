package cmd

import (
	"os"
	"strings"
	"testing"
)

func TestDesktopTerminalRequiresCompleteNativeOwner(t *testing.T) {
	for _, key := range []string{"DECEPTICON_DESKTOP_WORKSPACE_ID", "DECEPTICON_DESKTOP_ENGAGEMENT_ID", "DECEPTICON_DESKTOP_RUN_ID", "DECEPTICON_DESKTOP_TERMINAL_NONCE"} {
		t.Setenv(key, "")
	}
	if owner, err := desktopTerminalRequest(); err != nil || owner != nil {
		t.Fatal("ordinary CLI must not register a terminal")
	}
	t.Setenv("DECEPTICON_DESKTOP_RUN_ID", strings.Repeat("a", 32))
	if _, err := desktopTerminalRequest(); err == nil {
		t.Fatal("partial owner accepted")
	}
	t.Setenv("DECEPTICON_DESKTOP_WORKSPACE_ID", strings.Repeat("b", 32))
	t.Setenv("DECEPTICON_DESKTOP_ENGAGEMENT_ID", strings.Repeat("c", 32))
	t.Setenv("DECEPTICON_DESKTOP_TERMINAL_NONCE", strings.Repeat("d", 64))
	if _, err := desktopTerminalRequest(); err != nil {
		t.Fatal(err)
	}
	t.Setenv("DECEPTICON_DESKTOP_TERMINAL_NONCE", strings.Repeat("d", 63)+"\n")
	if _, err := desktopTerminalRequest(); err == nil {
		t.Fatal("malformed nonce accepted")
	}
}

func TestDesktopTerminalOverlayPreservesPolicyAndOwnsSandbox(t *testing.T) {
	home := t.TempDir()
	base, err := os.CreateTemp(home, "policy-*.yml")
	if err != nil {
		t.Fatal(err)
	}
	_, err = base.WriteString("services:\n  litellm:\n    environment:\n      KEEP_PROVIDER: enabled\n  langgraph:\n    environment:\n      KEEP_POLICY: enabled\n")
	if err != nil {
		t.Fatal(err)
	}
	base.Close()
	owner := &desktopTerminalOwner{strings.Repeat("a", 32), strings.Repeat("b", 32), strings.Repeat("c", 32), strings.Repeat("d", 64)}
	path, err := writeDesktopTerminalOverlay(home, base.Name(), owner)
	if err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	parts := strings.Split(string(data), "  sandbox:\n")
	if len(parts) != 2 || !strings.Contains(parts[0], "KEEP_POLICY: enabled") || !strings.Contains(parts[0], "KEEP_PROVIDER: enabled") || strings.Count(string(data), "  litellm:\n") != 1 {
		t.Fatal("terminal labels changed policy ownership")
	}
	for key, value := range owner.labels() {
		if !strings.Contains(parts[1], "io.decepticon.desktop."+key+": \""+value+"\"") {
			t.Fatal("missing native owner label", key)
		}
	}
	info, err := os.Stat(path)
	if err != nil || info.Mode().Perm()&0o077 != 0 {
		t.Fatal("owner overlay is not private")
	}
}

func TestDesktopTerminalMeasuresTmuxStatusHeight(t *testing.T) {
	for value, want := range map[string]uint16{"off": 0, "on": 1, "0": 0, "2": 2, "5": 5} {
		got, err := terminalStatusRows(value)
		if err != nil || got != want {
			t.Fatalf("%q: %d %v", value, got, err)
		}
	}
	for _, value := range []string{"", "6", "-1", "on\nother", "65536"} {
		if _, err := terminalStatusRows(value); err == nil {
			t.Fatal("unsupported status accepted", value)
		}
	}
}

func TestDesktopPinnedAgentImageCannotInjectComposeConfiguration(t *testing.T) {
	for _, value := range []string{"arbitrary:latest", "decepticon-desktop-agent:sha-" + strings.Repeat("a", 39), "decepticon-desktop-agent:sha-" + strings.Repeat("a", 40) + "\n  web:"} {
		t.Setenv("DECEPTICON_DESKTOP_AGENT_IMAGE", value)
		if _, err := writeDesktopRuntimeOverlay(t.TempDir(), &desktopModelRuntime{provider: "ollama", model: "ollama_chat/fixture"}); err == nil {
			t.Fatal("invalid pinned image accepted", value)
		}
	}
	t.Setenv("DECEPTICON_DESKTOP_AGENT_IMAGE", "decepticon-desktop-agent:sha-"+strings.Repeat("a", 40))
	path, err := writeDesktopRuntimeOverlay(t.TempDir(), &desktopModelRuntime{provider: "ollama", model: "ollama_chat/fixture"})
	if err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	parts := strings.Split(string(data), "  langgraph:\n")
	if len(parts) != 2 || strings.Contains(parts[0], "image:") || !strings.Contains(parts[1], "    image: decepticon-desktop-agent:sha-") {
		t.Fatal("native image must belong only to the agent service")
	}
}

func TestDesktopOllamaRelayRejectsNonPrivateOrMalformedEndpoints(t *testing.T) {
	t.Setenv("DECEPTICON_DESKTOP_PROVIDER", "ollama")
	t.Setenv("DECEPTICON_DESKTOP_MODEL", "ollama_chat/fixture")
	t.Setenv("DECEPTICON_DESKTOP_API_KEY", "")
	for _, base := range []string{"https://172.17.0.1:1234", "http://8.8.8.8:1234", "http://user@172.17.0.1:1234", "http://172.17.0.1:1234/evil", "http://172.17.0.1:1234?x=1", "http://172.17.0.1:99999"} {
		t.Setenv("DECEPTICON_DESKTOP_OLLAMA_BASE", base)
		if _, err := parseDesktopRuntime(true); err == nil {
			t.Fatal("invalid relay accepted", base)
		}
	}
	t.Setenv("DECEPTICON_DESKTOP_OLLAMA_BASE", "http://172.17.0.1:43123")
	selected, err := parseDesktopRuntime(true)
	if err != nil {
		t.Fatal(err)
	}
	path, err := writeDesktopRuntimeOverlay(t.TempDir(), selected)
	if err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(data), "OLLAMA_API_BASE: http://172.17.0.1:43123") {
		t.Fatal("native relay was not applied")
	}
}
