package cmd

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"time"
)

type desktopBrowserDescriptor struct {
	Protocol       string `json:"protocol"`
	EngagementID   string `json:"engagement_id"`
	RunID          string `json:"run_id"`
	Epoch          string `json:"epoch"`
	Endpoint       string `json:"endpoint"`
	Transport      string `json:"transport"`
	BootstrapToken string `json:"bootstrap_token"`
	ExpiresAtMS    int64  `json:"expires_at_ms"`
	HostCommit     string `json:"host_commit"`
}

func writeDesktopBrowserOverlay(home, source, engagement, existing string) (string, error) {
	if runtime.GOOS == "windows" {
		return "", fmt.Errorf("INCOMPATIBLE_RUNTIME: Windows browser forwarding is not qualified")
	}
	path, err := filepath.Abs(source)
	if err != nil {
		return "", err
	}
	runDir, err := filepath.Abs(filepath.Join(home, "run"))
	if err != nil {
		return "", err
	}
	canonicalRunDir, err := filepath.EvalSymlinks(runDir)
	if err != nil {
		return "", fmt.Errorf("UNAUTHORIZED_ADAPTER: private Local run directory unavailable: %w", err)
	}
	resolved, err := filepath.EvalSymlinks(path)
	if err != nil || resolved != filepath.Join(canonicalRunDir, filepath.Base(path)) || filepath.Dir(path) != runDir {
		return "", fmt.Errorf("UNAUTHORIZED_ADAPTER: descriptor must be a direct private Local run file")
	}
	info, err := os.Lstat(path)
	if err != nil || !info.Mode().IsRegular() || info.Mode().Perm()&0o077 != 0 || info.Size() > 16384 {
		return "", fmt.Errorf("UNAUTHORIZED_ADAPTER: invalid descriptor file")
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	var descriptor desktopBrowserDescriptor
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&descriptor); err != nil {
		return "", fmt.Errorf("INCOMPATIBLE_RUNTIME: malformed browser descriptor")
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		return "", fmt.Errorf("INCOMPATIBLE_RUNTIME: trailing browser descriptor data")
	}
	id := regexp.MustCompile(`^[A-Za-z0-9_-]{1,128}$`)
	nonce := regexp.MustCompile(`^[a-f0-9]{64}$`)
	commit := regexp.MustCompile(`^[a-f0-9]{40}$`)
	remaining := descriptor.ExpiresAtMS - time.Now().UnixMilli()
	if descriptor.Protocol != "owned-browser-v1" || descriptor.Transport != "unix" ||
		descriptor.Endpoint != "http://127.0.0.1:1" || descriptor.EngagementID != engagement ||
		!id.MatchString(descriptor.RunID) || !nonce.MatchString(descriptor.Epoch) ||
		!nonce.MatchString(descriptor.BootstrapToken) || !commit.MatchString(descriptor.HostCommit) ||
		remaining <= 0 || remaining > 60000 {
		return "", fmt.Errorf("INCOMPATIBLE_RUNTIME: browser registration mismatch or expiry")
	}
	socket := filepath.Join(runDir, "browser.sock")
	socketInfo, err := os.Lstat(socket)
	if err != nil || socketInfo.Mode()&os.ModeSocket == 0 {
		return "", fmt.Errorf("INCOMPATIBLE_RUNTIME: owned browser socket missing")
	}
	content := "services:\n  langgraph:\n"
	if existing != "" {
		base, err := os.ReadFile(existing)
		if err != nil {
			return "", err
		}
		content = string(base)
	}
	for _, mount := range [][2]string{{path, "/run/decepticon/browser.json"}, {socket, "/run/decepticon/browser.sock"}} {
		sourceJSON, err := json.Marshal(mount[0])
		if err != nil {
			return "", err
		}
		if mount[1] == "/run/decepticon/browser.json" {
			content += "    volumes:\n"
		}
		content += "      - type: bind\n        source: " + string(sourceJSON) + "\n        target: " + mount[1] + "\n        read_only: true\n"
	}
	file, err := os.CreateTemp(home, ".desktop-browser-*.yml")
	if err != nil {
		return "", err
	}
	defer file.Close()
	if _, err := file.WriteString(content); err != nil {
		os.Remove(file.Name())
		return "", err
	}
	return file.Name(), nil
}
