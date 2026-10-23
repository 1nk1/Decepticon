package cmd

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"github.com/BitterSecurity/Decepticon/clients/launcher/internal/config"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"time"
)

// This request comes from the native host, never an agent or browser request.
type desktopTerminalOwner struct{ workspace, engagement, run, nonce string }
type desktopTerminalReceipt struct {
	Protocol   string `json:"protocol"`
	Run        string `json:"run"`
	Container  string `json:"container"`
	Session    string `json:"session"`
	StatusRows uint16 `json:"statusRows"`
}

func desktopTerminalRequest() (*desktopTerminalOwner, error) {
	run, nonce := os.Getenv("DECEPTICON_DESKTOP_RUN_ID"), os.Getenv("DECEPTICON_DESKTOP_TERMINAL_NONCE")
	if run == "" && nonce == "" {
		return nil, nil
	}
	owner := &desktopTerminalOwner{os.Getenv("DECEPTICON_DESKTOP_WORKSPACE_ID"), os.Getenv("DECEPTICON_DESKTOP_ENGAGEMENT_ID"), run, nonce}
	for _, entry := range []struct {
		value string
		size  int
	}{{owner.workspace, 32}, {owner.engagement, 32}, {run, 32}, {nonce, 64}} {
		if decoded, err := hex.DecodeString(entry.value); err != nil || len(decoded)*2 != entry.size {
			return nil, fmt.Errorf("invalid host terminal ownership")
		}
	}
	return owner, nil
}

func (owner *desktopTerminalOwner) labels() map[string]string {
	return map[string]string{"workspace": owner.workspace, "engagement": owner.engagement, "run": owner.run, "nonce": owner.nonce, "capability": "owned-terminal-v1"}
}

func writeDesktopTerminalOverlay(home, existing string, owner *desktopTerminalOwner) (string, error) {
	content := "services:\n"
	if existing != "" {
		data, err := os.ReadFile(existing)
		if err != nil {
			return "", err
		}
		content = string(data)
	}
	content += "  sandbox:\n    labels:\n"
	for _, key := range []string{"workspace", "engagement", "run", "nonce", "capability"} {
		value, _ := json.Marshal(owner.labels()[key])
		content += "      io.decepticon.desktop." + key + ": " + string(value) + "\n"
	}
	file, err := os.CreateTemp(home, ".desktop-terminal-*.yml")
	if err != nil {
		return "", err
	}
	defer file.Close()
	if err := config.ProtectPrivateFile(file.Name()); err != nil {
		os.Remove(file.Name())
		return "", err
	}
	if _, err := file.WriteString(content); err != nil {
		os.Remove(file.Name())
		return "", err
	}
	return file.Name(), nil
}

func terminalDocker(args ...string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, "docker", args...).CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("owned terminal setup failed: %w", err)
	}
	return out, nil
}

func (owner *desktopTerminalOwner) receipt() (*desktopTerminalReceipt, error) {
	name := "decepticon"
	if stack := strings.TrimSpace(os.Getenv("DECEPTICON_STACK_NAME")); stack != "" {
		name += "-" + stack
	}
	data, err := terminalDocker("inspect", "--type", "container", name+"-sandbox")
	if err != nil {
		return nil, err
	}
	var records []struct {
		ID     string `json:"Id"`
		Config struct {
			Labels map[string]string `json:"Labels"`
		} `json:"Config"`
		State struct {
			Running bool `json:"Running"`
		} `json:"State"`
	}
	if err := json.Unmarshal(data, &records); err != nil || len(records) != 1 || !records[0].State.Running {
		return nil, fmt.Errorf("owned sandbox unavailable")
	}
	record := records[0]
	for key, value := range owner.labels() {
		if record.Config.Labels["io.decepticon.desktop."+key] != value {
			return nil, fmt.Errorf("owned sandbox identity mismatch")
		}
	}
	if decoded, err := hex.DecodeString(record.ID); err != nil || len(decoded) != 32 {
		return nil, fmt.Errorf("invalid sandbox identity")
	}
	// Preserve an existing agent shell; only create its default session when absent.
	if _, err := terminalDocker("exec", record.ID, "tmux", "has-session", "-t", "=main"); err != nil {
		if _, err := terminalDocker("exec", record.ID, "tmux", "new-session", "-d", "-s", "main", "-c", "/workspace"); err != nil {
			return nil, err
		}
	}
	status, err := terminalDocker("exec", record.ID, "tmux", "show-options", "-t", "=main", "-v", "status")
	if err != nil {
		return nil, err
	}
	rows, err := terminalStatusRows(strings.TrimSpace(string(status)))
	if err != nil {
		return nil, err
	}
	return &desktopTerminalReceipt{Protocol: "owned-terminal-v1", Run: owner.run, Container: record.ID, Session: "main", StatusRows: rows}, nil
}

func terminalStatusRows(value string) (uint16, error) {
	if value == "off" {
		return 0, nil
	}
	if value == "on" {
		return 1, nil
	}
	rows, err := strconv.ParseUint(value, 10, 16)
	if err != nil || rows > 5 {
		return 0, fmt.Errorf("unsupported tmux status height")
	}
	return uint16(rows), nil
}
