package cmd

import "testing"

func TestValidateDesktopSandboxMounts(t *testing.T) {
	good := []byte(`[{"Source":"/home/user/.decepticon/workspace/first","Destination":"/workspace"}]`)
	if err := validateDesktopSandboxMounts(good, "/home/user/.decepticon/workspace/first"); err != nil {
		t.Fatal(err)
	}
	for _, data := range [][]byte{
		[]byte(`[{"Source":"/home/user/.decepticon/workspace/second","Destination":"/workspace"}]`),
		[]byte(`[{"Source":"/home/user/.decepticon/workspace/first","Destination":"/other"}]`),
		[]byte(`not-json`),
	} {
		if err := validateDesktopSandboxMounts(data, "/home/user/.decepticon/workspace/first"); err == nil {
			t.Fatalf("accepted unsafe sandbox mounts: %s", data)
		}
	}
}
