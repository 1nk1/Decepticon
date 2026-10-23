package compose

import (
	"encoding/json"
	"os"
	"path/filepath"
	"slices"
	"testing"

	"github.com/BitterSecurity/Decepticon/clients/launcher/internal/runtime"
)

func TestResumeHelperProcess(t *testing.T) {
	path := os.Getenv("DECEPTICON_RESUME_TEST_CAPTURE")
	if path == "" {
		return
	}
	data, err := json.Marshal(os.Args)
	if err != nil {
		os.Exit(2)
	}
	if err := os.WriteFile(path, data, 0o600); err != nil {
		os.Exit(3)
	}
	os.Exit(0)
}

func TestRunInteractiveForwardsResumeToContainer(t *testing.T) {
	// Given a subprocess standing in for the container runtime.
	home := t.TempDir()
	capture := filepath.Join(home, "argv.json")
	t.Setenv("DECEPTICON_RESUME_TEST_CAPTURE", capture)
	c := &Compose{Home: home, ComposeFile: filepath.Join(home, "compose.yml"), EnvFile: filepath.Join(home, ".env"), Runtime: runtime.Runtime{Bin: os.Args[0], ComposeArgs: []string{"-test.run=TestResumeHelperProcess", "--"}}}
	// When launching the real Compose adapter with a selected thread.
	err := c.RunInteractive([]string{"cli"}, "cli", map[string]string{"DECEPTICON_THREAD_ID": "thread-123"})
	if err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(capture)
	if err != nil {
		t.Fatal(err)
	}
	var args []string
	if err := json.Unmarshal(data, &args); err != nil {
		t.Fatal(err)
	}
	// Then the thread is a container environment option before the service.
	index := slices.Index(args, "DECEPTICON_THREAD_ID=thread-123")
	if index < 1 || args[index-1] != "-e" || args[len(args)-1] != "cli" {
		t.Fatalf("incorrect container invocation: %v", args)
	}
}
