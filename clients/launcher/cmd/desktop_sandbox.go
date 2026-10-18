package cmd

import (
	"encoding/json"
	"fmt"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

type dockerMount struct {
	Source      string `json:"Source"`
	Destination string `json:"Destination"`
}

func mountSourceMatchesWorkspace(source, expected string) bool {
	if runtime.GOOS != "windows" {
		return filepath.Clean(source) == filepath.Clean(expected)
	}
	normalize := func(value string) string {
		value = strings.ToLower(strings.ReplaceAll(value, "\\", "/"))
		for _, prefix := range []string{"/run/desktop/mnt/host", "/host_mnt"} {
			if strings.HasPrefix(value, prefix+"/") {
				value = strings.TrimPrefix(value, prefix)
			}
		}
		if len(value) >= 2 && value[1] == ':' {
			value = "/" + value[:1] + value[2:]
		}
		return filepath.Clean(value)
	}
	return normalize(source) == normalize(expected)
}

func validateDesktopSandboxMounts(data []byte, expected string) error {
	var mounts []dockerMount
	if err := json.Unmarshal(data, &mounts); err != nil {
		return fmt.Errorf("read existing sandbox mounts: %w", err)
	}
	for _, mount := range mounts {
		if mount.Destination == "/workspace" {
			if mountSourceMatchesWorkspace(mount.Source, expected) {
				return nil
			}
			return fmt.Errorf("the OSS sandbox is attached to another engagement; stop it before opening this one in Desktop")
		}
	}
	return fmt.Errorf("the existing OSS sandbox has no engagement workspace mount")
}

func checkDesktopSandboxMount(stackName, expected string) error {
	container := "decepticon"
	if stackName != "" {
		container += "-" + stackName
	}
	container += "-sandbox"
	out, err := exec.Command("docker", "inspect", "--type", "container", "--format", "{{json .Mounts}}", container).CombinedOutput()
	if err != nil {
		if strings.Contains(string(out), "No such object") || strings.Contains(string(out), "No such container") {
			return nil
		}
		return fmt.Errorf("inspect existing sandbox: %s", strings.TrimSpace(string(out)))
	}
	return validateDesktopSandboxMounts(out, expected)
}
