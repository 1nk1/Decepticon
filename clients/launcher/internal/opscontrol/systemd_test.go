package opscontrol

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestSystemdInstallRestartsActiveServiceForNewRunDir(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("uses a shell stub for systemctl")
	}
	home := t.TempDir()
	t.Setenv("HOME", home)
	logPath := filepath.Join(home, "systemctl.log")
	t.Setenv("OPSCONTROL_TEST_LOG", logPath)
	stub := filepath.Join(home, "systemctl-stub")
	if err := os.WriteFile(stub, []byte("#!/bin/sh\nprintf '%s\\n' \"$*\" >> \"$OPSCONTROL_TEST_LOG\"\nif [ \"$2\" = is-active ]; then echo active; fi\n"), 0o700); err != nil {
		t.Fatal(err)
	}
	previous := systemctlBinary
	systemctlBinary = stub
	defer func() { systemctlBinary = previous }()
	manager := &SystemdManager{UnitName: "decepticon-opscontrol"}
	if err := manager.Install(InstallSpec{
		BinaryPath: "/bin/decepticon", HomePath: home, RunDir: filepath.Join(home, "new-run"),
	}); err != nil {
		t.Fatal(err)
	}
	log, err := os.ReadFile(logPath)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(log), "--user enable --now decepticon-opscontrol.service") ||
		!strings.Contains(string(log), "--user restart decepticon-opscontrol.service") {
		t.Fatalf("updated active service was not restarted: %s", log)
	}
}

func TestManagedRunDirRenderedForSystemdAndLaunchd(t *testing.T) {
	spec := InstallSpec{BinaryPath: "/bin/decepticon", HomePath: "/home/user/decepticon", RunDir: "/tmp/ops-run"}
	unit := (&SystemdManager{UnitName: "decepticon-opscontrol"}).renderUnit(spec)
	if !strings.Contains(unit, "Environment=DECEPTICON_OPSCONTROL_RUN_DIR=/tmp/ops-run") ||
		!strings.Contains(unit, "ReadWritePaths=/home/user/decepticon /tmp/ops-run") {
		t.Fatal("systemd unit did not carry the selected writable run directory")
	}
	plist := (&LaunchdManager{Label: "red.decepticon.opscontrol"}).renderPlist(spec)
	if !strings.Contains(plist, "<key>DECEPTICON_OPSCONTROL_RUN_DIR</key>") ||
		!strings.Contains(plist, "<string>/tmp/ops-run</string>") {
		t.Fatal("launchd plist did not carry the selected run directory")
	}
}

func TestManagedRunDirMismatchRequiresReinstall(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("DECEPTICON_OPSCONTROL_RUN_DIR", filepath.Join(home, "new-run"))
	manager := &SystemdManager{UnitName: "decepticon-opscontrol"}
	unitPath, err := manager.unitPath()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Dir(unitPath), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(unitPath, []byte(manager.renderUnit(InstallSpec{
		BinaryPath: "/bin/decepticon", HomePath: home,
	})), 0o600); err != nil {
		t.Fatal(err)
	}
	if matches, err := ManagedRunDirMatches(manager); err != nil || matches {
		t.Fatalf("old unit incorrectly matched new run dir: %v, %v", matches, err)
	}
	if err := os.WriteFile(unitPath, []byte(manager.renderUnit(InstallSpec{
		BinaryPath: "/bin/decepticon", HomePath: home, RunDir: filepath.Join(home, "new-run"),
	})), 0o600); err != nil {
		t.Fatal(err)
	}
	if matches, err := ManagedRunDirMatches(manager); err != nil || !matches {
		t.Fatalf("updated unit did not match run dir: %v, %v", matches, err)
	}
}

// TestRemoveStaleDropIns_DeletesDeadBinaryOverride covers the v1.1.10
// dogfood regression: a `systemctl edit` override from an earlier test
// pinned ExecStart= to /tmp/decepticon-stop-v3 (since deleted), and
// the launcher kept silently re-using it on `install`.
func TestRemoveStaleDropIns_DeletesDeadBinaryOverride(t *testing.T) {
	tmp := t.TempDir()
	dropInDir := filepath.Join(tmp, "decepticon-opscontrol.service.d")
	if err := os.MkdirAll(dropInDir, 0o755); err != nil {
		t.Fatalf("mkdir drop-in: %v", err)
	}
	staleBin := filepath.Join(tmp, "definitely-not-a-real-binary")
	overrideBody := "[Service]\nExecStart=\nExecStart=" + staleBin + " opscontrol daemon\n"
	overridePath := filepath.Join(dropInDir, "override.conf")
	if err := os.WriteFile(overridePath, []byte(overrideBody), 0o644); err != nil {
		t.Fatalf("write override: %v", err)
	}

	s := &SystemdManager{UnitName: "decepticon-opscontrol"}
	if !s.removeStaleDropIns(dropInDir) {
		t.Fatalf("expected stale drop-in removal, got false")
	}
	if _, err := os.Stat(overridePath); !os.IsNotExist(err) {
		t.Errorf("override.conf should be removed; stat err=%v", err)
	}
	// Drop-in directory is now empty, so it should also be gone — keeps
	// `systemctl edit` from re-opening a ghost directory.
	if _, err := os.Stat(dropInDir); !os.IsNotExist(err) {
		t.Errorf("empty drop-in dir should be removed; stat err=%v", err)
	}
}

// TestRemoveStaleDropIns_KeepsLiveBinaryOverride is the safety contract:
// an operator's legitimate override (custom env vars, restart policy
// tweaks) that points to a real binary must survive install.
func TestRemoveStaleDropIns_KeepsLiveBinaryOverride(t *testing.T) {
	tmp := t.TempDir()
	dropInDir := filepath.Join(tmp, "decepticon-opscontrol.service.d")
	if err := os.MkdirAll(dropInDir, 0o755); err != nil {
		t.Fatalf("mkdir drop-in: %v", err)
	}
	// Use the test binary itself as the "live" ExecStart target.
	liveBin, err := os.Executable()
	if err != nil {
		t.Fatalf("locate test binary: %v", err)
	}
	overrideBody := "[Service]\nExecStart=\nExecStart=" + liveBin + " opscontrol daemon\n"
	overridePath := filepath.Join(dropInDir, "override.conf")
	if err := os.WriteFile(overridePath, []byte(overrideBody), 0o644); err != nil {
		t.Fatalf("write override: %v", err)
	}

	s := &SystemdManager{UnitName: "decepticon-opscontrol"}
	if s.removeStaleDropIns(dropInDir) {
		t.Fatalf("live drop-in should not be removed")
	}
	if _, err := os.Stat(overridePath); err != nil {
		t.Errorf("override.conf should still exist; stat err=%v", err)
	}
}

// TestRemoveStaleDropIns_AcceptsModifierPrefixes covers systemd's
// ExecStart modifier syntax (- @ : + ! !!) so we don't false-positive
// or false-negative on operator overrides that use them.
func TestRemoveStaleDropIns_AcceptsModifierPrefixes(t *testing.T) {
	tmp := t.TempDir()
	dropInDir := filepath.Join(tmp, "decepticon-opscontrol.service.d")
	if err := os.MkdirAll(dropInDir, 0o755); err != nil {
		t.Fatalf("mkdir drop-in: %v", err)
	}
	staleBin := filepath.Join(tmp, "ghost-binary")
	for _, prefix := range []string{"-", "@", ":", "+", "!", "!!"} {
		sub := filepath.Join(dropInDir, "case-"+prefix+".conf")
		body := "[Service]\nExecStart=\nExecStart=" + prefix + staleBin + " opscontrol daemon\n"
		if err := os.WriteFile(sub, []byte(body), 0o644); err != nil {
			t.Fatalf("write override: %v", err)
		}
	}

	s := &SystemdManager{UnitName: "decepticon-opscontrol"}
	if !s.removeStaleDropIns(dropInDir) {
		t.Fatalf("expected stale removal across modifier prefixes")
	}
}

// TestRemoveStaleDropIns_NoDirIsNoop guards against panic / error
// when there's never been a drop-in (the common case on fresh installs).
func TestRemoveStaleDropIns_NoDirIsNoop(t *testing.T) {
	s := &SystemdManager{UnitName: "decepticon-opscontrol"}
	if s.removeStaleDropIns(filepath.Join(t.TempDir(), "does-not-exist")) {
		t.Fatalf("missing drop-in dir should not report removal")
	}
}
