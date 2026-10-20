package cmd

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

func desktopPolicyOverlay() (string, string, error) {
	directory := os.Getenv("DECEPTICON_DESKTOP_POLICY_DIR")
	workspaceID := os.Getenv("DECEPTICON_DESKTOP_WORKSPACE_ID")
	engagementID := os.Getenv("DECEPTICON_DESKTOP_ENGAGEMENT_ID")
	if directory == "" && workspaceID == "" && engagementID == "" {
		return "", "", nil
	}
	if !validDesktopOwner(workspaceID) || !validDesktopOwner(engagementID) {
		return "", "", fmt.Errorf("Desktop policy requires host workspace and engagement identities")
	}
	custody, err := desktopPolicyDirectory(directory)
	if err != nil {
		return "", "", err
	}
	workspace, err := desktopPolicyDirectory(os.Getenv("DECEPTICON_DESKTOP_WORKSPACE"))
	if err != nil {
		return "", "", fmt.Errorf("Desktop policy workspace: %w", err)
	}
	relative, err := filepath.Rel(workspace, custody)
	if err == nil && relative != ".." && !strings.HasPrefix(relative, ".."+string(os.PathSeparator)) {
		return "", "", fmt.Errorf("Desktop policy custody must be outside the writable workspace")
	}
	source, err := json.Marshal(strings.ReplaceAll(filepath.ToSlash(custody), "$", "$$"))
	if err != nil {
		return "", "", fmt.Errorf("encode Desktop policy directory: %w", err)
	}
	environment := "      DECEPTICON_DESKTOP_POLICY_DIR: /run/decepticon-desktop-policy\n" +
		"      DECEPTICON_DESKTOP_WORKSPACE_ID: \"" + workspaceID + "\"\n" +
		"      DECEPTICON_DESKTOP_ENGAGEMENT_ID: \"" + engagementID + "\"\n"
	mount := "    volumes:\n" +
		"      - type: bind\n" +
		"        source: " + string(source) + "\n" +
		"        target: /run/decepticon-desktop-policy\n" +
		"        read_only: true\n" +
		"        bind:\n" +
		"          create_host_path: false\n"
	return environment, mount, nil
}

func desktopPolicyDirectory(path string) (string, error) {
	if !filepath.IsAbs(path) {
		return "", fmt.Errorf("Desktop policy requires an absolute existing directory")
	}
	resolved, err := filepath.EvalSymlinks(path)
	if err != nil {
		return "", fmt.Errorf("resolve Desktop policy directory: %w", err)
	}
	info, err := os.Stat(resolved)
	if err != nil {
		return "", fmt.Errorf("inspect Desktop policy directory: %w", err)
	}
	if !info.IsDir() {
		return "", fmt.Errorf("Desktop policy requires a directory mount")
	}
	return filepath.Clean(resolved), nil
}

func validDesktopOwner(value string) bool {
	if len(value) < 1 || len(value) > 128 {
		return false
	}
	for _, ch := range value {
		if !(ch >= 'a' && ch <= 'z' || ch >= 'A' && ch <= 'Z' || ch >= '0' && ch <= '9' || strings.ContainsRune("_.-", ch)) {
			return false
		}
	}
	return true
}
