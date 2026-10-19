package opscontrol

import (
	"os"
	"path/filepath"
	"testing"
)

func TestRunDirCanUseLinuxFilesystemWhenSharedHomeCannotHostSockets(t *testing.T) {
	home := t.TempDir()
	run := filepath.Join(t.TempDir(), "run")
	t.Setenv("DECEPTICON_HOME", home)
	t.Setenv("DECEPTICON_STACK_NAME", "desktopqa")
	t.Setenv("DECEPTICON_OPSCONTROL_RUN_DIR", run)
	if got := HostSocketPath(); got != filepath.Join(run, "ops.desktopqa.sock") {
		t.Fatalf("socket path = %q", got)
	}
	if got := PIDFilePath(); got != filepath.Join(run, "opscontrol.desktopqa.pid") {
		t.Fatalf("PID path = %q", got)
	}
	if err := EnsureRunDir(); err != nil {
		t.Fatal(err)
	}
	if info, err := os.Stat(run); err != nil || !info.IsDir() {
		t.Fatalf("run directory was not created: %v", err)
	}
	t.Setenv("DECEPTICON_OPSCONTROL_RUN_DIR", "relative-path")
	if got := HostSocketPath(); got != filepath.Join(home, "run", "ops.desktopqa.sock") {
		t.Fatalf("relative override was accepted: %q", got)
	}
}
