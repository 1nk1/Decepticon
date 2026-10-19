package config

import (
	"os"
	"strings"
	"testing"

	"golang.org/x/sys/windows"
)

func TestPrivateFileHasProtectedWindowsACL(t *testing.T) {
	path := t.TempDir() + `\service.env`
	if err := os.WriteFile(path, nil, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := ProtectPrivateFile(path); err != nil {
		t.Fatal(err)
	}
	sd, err := windows.GetNamedSecurityInfo(path, windows.SE_FILE_OBJECT,
		windows.DACL_SECURITY_INFORMATION)
	if err != nil {
		t.Fatal(err)
	}
	sddl := sd.String()
	if !strings.Contains(sddl, "D:P") || strings.Contains(sddl, ";;;WD)") ||
		strings.Contains(sddl, ";;;AU)") {
		t.Fatalf("private file has inherited or broad access: %s", sddl)
	}
}
