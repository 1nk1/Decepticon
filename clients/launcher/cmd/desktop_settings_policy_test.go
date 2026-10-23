package cmd

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestDesktopPolicyMountsDirectoryReadOnlyInAgentOnly(t *testing.T) {
	// Given host-owned custody outside the writable workspace.
	root := t.TempDir()
	custody := filepath.Join(root, "policy directory")
	workspace := filepath.Join(root, "workspace")
	for _, path := range []string{custody, workspace} {
		if err := os.Mkdir(path, 0o700); err != nil {
			t.Fatal(err)
		}
	}
	t.Setenv("DECEPTICON_DESKTOP_POLICY_DIR", custody)
	t.Setenv("DECEPTICON_DESKTOP_WORKSPACE", workspace)
	t.Setenv("DECEPTICON_DESKTOP_WORKSPACE_ID", "workspace-1")
	t.Setenv("DECEPTICON_DESKTOP_ENGAGEMENT_ID", "engagement-1")
	if err := os.WriteFile(filepath.Join(custody, "settings.json"), []byte(`{"protocol_version":1,"workspace_id":"workspace-1","engagement_id":"engagement-1","revision":7}`), 0o600); err != nil {
		t.Fatal(err)
	}
	// When the actual Desktop overlay is generated.
	path, err := writeDesktopRuntimeOverlay(root, &desktopModelRuntime{provider: "ollama", model: "ollama_chat/fixture"})
	if err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	// Then only the agent receives a directory mount and host identity.
	parts := strings.Split(string(data), "  langgraph:\n")
	if len(parts) != 2 || strings.Contains(parts[0], "POLICY") {
		t.Fatal("policy must belong only to langgraph")
	}
	for _, required := range []string{
		"DECEPTICON_DESKTOP_POLICY_DIR: /run/decepticon-desktop-policy",
		"DECEPTICON_DESKTOP_WORKSPACE_ID: \"workspace-1\"",
		"DECEPTICON_DESKTOP_POLICY_REVISION: \"7\"",
		"DECEPTICON_DESKTOP_ENGAGEMENT_ID: \"engagement-1\"",
		"source: \"" + filepath.ToSlash(custody) + "\"",
		"target: /run/decepticon-desktop-policy",
		"read_only: true",
		"create_host_path: false",
	} {
		if !strings.Contains(parts[1], required) {
			t.Fatalf("missing custody contract %q", required)
		}
	}
	if strings.Contains(parts[1], "settings.json") {
		t.Fatal("single-file mounts hide atomic policy replacements")
	}
}

func TestDesktopPolicyRejectsMismatchedOwnerOrInvalidRevision(t *testing.T) {
	root := t.TempDir()
	custody := filepath.Join(root, "policy")
	workspace := filepath.Join(root, "workspace")
	for _, path := range []string{custody, workspace} {
		if err := os.Mkdir(path, 0o700); err != nil {
			t.Fatal(err)
		}
	}
	t.Setenv("DECEPTICON_DESKTOP_POLICY_DIR", custody)
	t.Setenv("DECEPTICON_DESKTOP_WORKSPACE", workspace)
	t.Setenv("DECEPTICON_DESKTOP_WORKSPACE_ID", "workspace")
	t.Setenv("DECEPTICON_DESKTOP_ENGAGEMENT_ID", "engagement")
	for _, document := range []string{
		`{"protocol_version":1,"workspace_id":"other","engagement_id":"engagement","revision":1}`,
		`{"protocol_version":1,"workspace_id":"workspace","engagement_id":"engagement","revision":0}`,
		`{"protocol_version":1,"workspace_id":"workspace","engagement_id":"engagement","revision":1.5}`,
		strings.Repeat("x", 256*1024+1),
	} {
		if err := os.WriteFile(filepath.Join(custody, "settings.json"), []byte(document), 0o600); err != nil {
			t.Fatal(err)
		}
		if _, _, err := desktopPolicyOverlay(); err == nil {
			t.Fatal("invalid policy admitted")
		}
	}
}

func TestDesktopPolicyRejectsWritableWorkspaceCustody(t *testing.T) {
	root := t.TempDir()
	custody := filepath.Join(root, "policy")
	if err := os.Mkdir(custody, 0o700); err != nil {
		t.Fatal(err)
	}
	t.Setenv("DECEPTICON_DESKTOP_POLICY_DIR", custody)
	t.Setenv("DECEPTICON_DESKTOP_WORKSPACE", root)
	t.Setenv("DECEPTICON_DESKTOP_WORKSPACE_ID", "workspace-1")
	t.Setenv("DECEPTICON_DESKTOP_ENGAGEMENT_ID", "engagement-1")
	if _, err := writeDesktopRuntimeOverlay(root, &desktopModelRuntime{provider: "ollama", model: "ollama_chat/fixture"}); err == nil {
		t.Fatal("agent-writable custody must fail before compose starts")
	}
}

func TestDesktopPolicyRejectsMissingHostAuthority(t *testing.T) {
	t.Setenv("DECEPTICON_DESKTOP_POLICY_DIR", t.TempDir())
	t.Setenv("DECEPTICON_DESKTOP_WORKSPACE", t.TempDir())
	t.Setenv("DECEPTICON_DESKTOP_WORKSPACE_ID", "")
	t.Setenv("DECEPTICON_DESKTOP_ENGAGEMENT_ID", "engagement-1")
	if _, err := writeDesktopRuntimeOverlay(t.TempDir(), &desktopModelRuntime{provider: "ollama", model: "ollama_chat/fixture"}); err == nil {
		t.Fatal("policy without host workspace authority must fail")
	}
}
