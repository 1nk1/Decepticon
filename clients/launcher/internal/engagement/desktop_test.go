package engagement

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDesktopDocumentsStayInsideLocalHome(t *testing.T) {
	home := t.TempDir()
	documents := filepath.Join(home, "workspace-id", "engagement-id")
	if err := os.MkdirAll(filepath.Join(documents, "plan"), 0o700); err != nil {
		t.Fatal(err)
	}
	roe := []byte(`{"in_scope":[{"target":"https://example.com"}],"authorization_reference":"contract"}`)
	if err := os.WriteFile(filepath.Join(documents, "plan", "roe.json"), roe, 0o600); err != nil {
		t.Fatal(err)
	}
	choice, err := ResolveExistingAt(home, "target-name", documents)
	if err != nil {
		t.Fatal(err)
	}
	if choice.WorkspacePath != documents || choice.Target != "https://example.com" || choice.AssistantID != AssistantDecepticon {
		t.Fatalf("incorrect desktop scope: %#v", choice)
	}
	for _, invalid := range []string{home, filepath.Dir(home), filepath.Join(home, "metadata"), filepath.Join(home, "a", "b", "c"), t.TempDir()} {
		if _, err := ResolveExistingAt(home, "target-name", invalid); err == nil {
			t.Fatalf("accepted out-of-scope documents: %s", invalid)
		}
	}
	if _, err := ResolveExistingAt(home, "../escape", documents); err == nil {
		t.Fatal("accepted invalid engagement slug")
	}
}

func TestDesktopSandboxMustUseSameEngagement(t *testing.T) {
	home := t.TempDir()
	mkBareDir(t, home, "target-name")
	choice, err := ResolveExisting(home, "target-name")
	if err != nil {
		t.Fatal(err)
	}
	if choice.WorkspacePath != filepath.Join(home, "workspace", "target-name") {
		t.Fatal("legacy CLI folder moved")
	}
	if _, err := ResolveExisting(home, "missing-target"); err == nil {
		t.Fatal("created a missing engagement")
	}
}
