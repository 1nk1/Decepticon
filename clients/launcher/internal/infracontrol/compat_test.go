package infracontrol

import (
	"strings"
	"testing"
)

func TestNewServiceUnitsUseInfracontrolCommand(t *testing.T) {
	spec := InstallSpec{BinaryPath: "/usr/local/bin/decepticon", HomePath: "/tmp/decepticon"}
	systemd := (&SystemdManager{}).renderUnit(spec)
	if !strings.Contains(systemd, "ExecStart=/usr/local/bin/decepticon infracontrol daemon") {
		t.Fatalf("systemd command missing: %s", systemd)
	}
	if !strings.Contains(systemd, "Documentation=https://github.com/BitterSecurity/Decepticon/blob/main/docs/adr/0006-agent-driven-container-lifecycle.md") {
		t.Fatal("systemd documentation points at the old owner")
	}
	launchd := (&LaunchdManager{}).renderPlist(spec)
	if !strings.Contains(launchd, "<string>infracontrol</string>") {
		t.Fatalf("launchd command missing: %s", launchd)
	}
	if !strings.Contains(systemd, "DECEPTICON_HOME") || !strings.Contains(launchd, "DECEPTICON_HOME") {
		t.Fatal("service environment changed")
	}
}
