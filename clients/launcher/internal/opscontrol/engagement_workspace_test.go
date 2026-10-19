package opscontrol

import (
	"os"
	"path/filepath"
	"testing"
)

func TestEngagementWorkspaceBindsSelectedDirectory(t *testing.T) {
	home := t.TempDir()
	t.Setenv("DECEPTICON_HOME", home)
	wanted := filepath.Join(home, "workspace", "sample-engagement")
	if err := os.MkdirAll(wanted, 0o700); err != nil {
		t.Fatal(err)
	}
	resolved, err := filepath.EvalSymlinks(wanted)
	if err != nil {
		t.Fatal(err)
	}
	got, err := engagementWorkspace("sample-engagement")
	if err != nil || got != resolved {
		t.Fatalf("engagementWorkspace() = %q, %v; want %q", got, err, resolved)
	}
}

func TestEngagementWorkspaceRejectsEscapeAndMissingDirectory(t *testing.T) {
	home := t.TempDir()
	t.Setenv("DECEPTICON_HOME", home)
	root := filepath.Join(home, "workspace")
	if err := os.MkdirAll(root, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(t.TempDir(), filepath.Join(root, "linked-engagement")); err != nil {
		t.Fatal(err)
	}
	for _, slug := range []string{"../outside", "linked-engagement", "missing-engagement"} {
		if _, err := engagementWorkspace(slug); err == nil {
			t.Errorf("engagementWorkspace(%q) accepted an invalid path", slug)
		}
	}
}

func TestEngagementWorkspaceUsesValidatedDesktopChoice(t *testing.T) {
	home := t.TempDir()
	t.Setenv("DECEPTICON_HOME", home)
	t.Setenv("DECEPTICON_OPSCONTROL_RUN_DIR", filepath.Join(home, "run"))
	wanted := filepath.Join(home, "workspace", "desktop-workspace", "sample-engagement")
	if err := os.MkdirAll(wanted, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := RecordEngagementWorkspace("sample-engagement", wanted); err != nil {
		t.Fatal(err)
	}
	wanted, err := filepath.EvalSymlinks(wanted)
	if err != nil {
		t.Fatal(err)
	}
	got, err := engagementWorkspace("sample-engagement")
	if err != nil || got != wanted {
		t.Fatalf("engagementWorkspace() = %q, %v; want %q", got, err, wanted)
	}
	if err := RecordEngagementWorkspace("other-engagement", wanted); err == nil {
		t.Fatal("workspace for another engagement was accepted")
	}
	outside := filepath.Join(t.TempDir(), "sample-engagement")
	if err := os.MkdirAll(outside, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := RecordEngagementWorkspace("sample-engagement", outside); err == nil {
		t.Fatal("workspace outside home was accepted")
	}
}
