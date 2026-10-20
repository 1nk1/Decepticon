package cmd

import (
	"encoding/json"
	"net"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

func browserRegistration(t *testing.T) (string, string) {
	t.Helper()
	if runtime.GOOS == "windows" {
		t.Skip("Unix browser forwarding is not supported on Windows")
	}
	home, err := os.MkdirTemp("", "browser-reg-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := os.RemoveAll(home); err != nil {
			t.Error(err)
		}
	})
	run := filepath.Join(home, "run")
	if err := os.Mkdir(run, 0o700); err != nil {
		t.Fatal(err)
	}
	listener, err := net.Listen("unix", filepath.Join(run, "browser.sock"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := listener.Close(); err != nil {
			t.Error(err)
		}
	})
	descriptor := desktopBrowserDescriptor{
		Protocol: "owned-browser-v1", EngagementID: "fixture", RunID: "run-1",
		Epoch: strings.Repeat("a", 64), Endpoint: "http://127.0.0.1:1", Transport: "unix",
		BootstrapToken: strings.Repeat("b", 64), ExpiresAtMS: time.Now().UnixMilli() + 60000,
		HostCommit: strings.Repeat("c", 40),
	}
	raw, err := json.Marshal(descriptor)
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(run, "browser.json")
	if err := os.WriteFile(path, raw, 0o600); err != nil {
		t.Fatal(err)
	}
	return home, path
}

func TestDesktopBrowserAcceptsCanonicalHomeAlias(t *testing.T) {
	home, _ := browserRegistration(t)
	parent, err := os.MkdirTemp("", "browser-alias-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := os.RemoveAll(parent); err != nil {
			t.Error(err)
		}
	})
	alias := filepath.Join(parent, "owned")
	if err := os.Symlink(home, alias); err != nil {
		t.Fatal(err)
	}
	if _, err := writeDesktopBrowserOverlay(alias, filepath.Join(alias, "run", "browser.json"), "fixture", ""); err != nil {
		t.Fatal(err)
	}
}

func TestDesktopBrowserWindowsForwardingRejected(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("Windows-only unsupported transport contract")
	}
	home := t.TempDir()
	_, err := writeDesktopBrowserOverlay(home, filepath.Join(home, "run", "browser.json"), "fixture", "")
	if err == nil || !strings.Contains(err.Error(), "Windows browser forwarding is not qualified") {
		t.Fatalf("expected explicit unsupported Windows transport, got %v", err)
	}
	entries, err := os.ReadDir(home)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 0 {
		t.Fatal("unsupported transport created runtime files")
	}
}

func TestDesktopBrowserOverlayMountsOnlyLanggraph(t *testing.T) {
	home, descriptor := browserRegistration(t)
	base, err := writeDesktopRuntimeOverlay(home, &desktopModelRuntime{provider: "ollama", model: "ollama_chat/fixture"})
	if err != nil {
		t.Fatal(err)
	}
	path, err := writeDesktopBrowserOverlay(home, descriptor, "fixture", base)
	if err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	text := string(raw)
	if strings.Count(text, "    volumes:\n") != 1 || strings.Index(text, "    volumes:\n") < strings.Index(text, "  langgraph:\n") {
		t.Fatal("mounts not isolated to langgraph")
	}
	if strings.Count(text, "read_only: true") != 2 || !strings.Contains(text, "target: /run/decepticon/browser.json") || !strings.Contains(text, "target: /run/decepticon/browser.sock") {
		t.Fatal("invalid browser mounts")
	}
	if strings.Count(text, "DECEPTICON_MODEL:") != 2 {
		t.Fatal("lost model configuration")
	}
	if strings.Contains(string(raw), strings.Repeat("b", 64)) {
		t.Fatal("bootstrap token leaked into overlay")
	}
}

func TestDesktopBrowserRejectsForeignOrPublicDescriptor(t *testing.T) {
	for _, scenario := range []string{"foreign", "public", "symlink", "malformed", "missing-socket"} {
		t.Run(scenario, func(t *testing.T) {
			home, descriptor := browserRegistration(t)
			engagement := "fixture"
			switch scenario {
			case "foreign":
				engagement = "other"
			case "public":
				if err := os.Chmod(descriptor, 0o644); err != nil {
					t.Fatal(err)
				}
			case "symlink":
				link := filepath.Join(home, "run", "link.json")
				if err := os.Symlink(descriptor, link); err != nil {
					t.Fatal(err)
				}
				descriptor = link
			case "malformed":
				if err := os.WriteFile(descriptor, []byte("{}"), 0o600); err != nil {
					t.Fatal(err)
				}
			case "missing-socket":
				if err := os.Remove(filepath.Join(home, "run", "browser.sock")); err != nil {
					t.Fatal(err)
				}
			}
			if _, err := writeDesktopBrowserOverlay(home, descriptor, engagement, ""); err == nil {
				t.Fatal("accepted unauthorized registration")
			}
		})
	}
}

func TestDesktopBrowserDirectoryAllowsColdStartWithoutCredentials(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("Unix-only registration transport")
	}
	home := t.TempDir()
	path := filepath.Join(home, "run", "browser-runs")
	if err := os.MkdirAll(path, 0o700); err != nil {
		t.Fatal(err)
	}
	overlay, err := writeDesktopBrowserRegistrationsOverlay(home, path, "")
	if err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(overlay)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(raw), "target: /run/decepticon/browser-runs") || strings.Count(string(raw), "read_only: true") != 1 {
		t.Fatalf("invalid directory mount: %s", raw)
	}
	if err := os.Chmod(path, 0o755); err != nil {
		t.Fatal(err)
	}
	if _, err := writeDesktopBrowserRegistrationsOverlay(home, path, ""); err == nil {
		t.Fatal("accepted public registration directory")
	}
}
