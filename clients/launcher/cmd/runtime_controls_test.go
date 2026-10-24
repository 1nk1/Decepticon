package cmd

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/spf13/cobra"
)

func controlsCommand(t *testing.T) *cobra.Command {
	t.Helper()
	t.Setenv("DECEPTICON_HOME", t.TempDir())
	for _, key := range []string{"DECEPTICON_LLM__FALLBACK_MODELS", "DECEPTICON_LLM__EFFORT", "DECEPTICON_LLM__AUTOCOMPACT"} {
		t.Setenv(key, "")
	}
	command := &cobra.Command{}
	for _, name := range []string{"fallback-model", "effort", "autocompact"} {
		command.Flags().String(name, "", "")
	}
	return command
}

func TestRuntimeControlsFlagsOverrideEnvironmentAndFile(t *testing.T) {
	command := controlsCommand(t)
	if err := os.WriteFile(filepath.Join(os.Getenv("DECEPTICON_HOME"), ".env"), []byte("DECEPTICON_LLM__EFFORT=low\n"), 0600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("DECEPTICON_LLM__EFFORT", "medium")
	_ = command.Flags().Set("effort", "high")
	_ = command.Flags().Set("fallback-model", "openai/one,openai/two")
	_ = command.Flags().Set("autocompact", "4096")
	result, err := runtimeControlsEnvironment(command)
	if err != nil {
		t.Fatal(err)
	}
	if result["DECEPTICON_LLM__EFFORT"] != "high" || result["DECEPTICON_LLM__FALLBACK_MODELS"] != `["openai/one","openai/two"]` || result["DECEPTICON_LLM__AUTOCOMPACT"] != "4096" {
		t.Fatal(result)
	}
}

func TestRuntimeControlsDefaultAndExplicitReset(t *testing.T) {
	command := controlsCommand(t)
	result, err := runtimeControlsEnvironment(command)
	if err != nil || len(result) != 0 {
		t.Fatalf("defaults changed: %v %v", result, err)
	}
	_ = command.Flags().Set("fallback-model", "none")
	result, err = runtimeControlsEnvironment(command)
	if err != nil || result["DECEPTICON_LLM__FALLBACK_MODELS"] != "[]" {
		t.Fatal(result, err)
	}
	_ = command.Flags().Set("fallback-model", "auto")
	result, err = runtimeControlsEnvironment(command)
	if err != nil || result["DECEPTICON_LLM__FALLBACK_MODELS"] != "null" {
		t.Fatal(result, err)
	}
}

func TestRuntimeControlsRejectMalformedFlagsBeforeStartup(t *testing.T) {
	for _, tc := range []struct{ flag, value string }{
		{"effort", "extreme"}, {"effort", ""}, {"autocompact", "1023"}, {"autocompact", "10000001"}, {"autocompact", "1.5"},
		{"fallback-model", "bad model"}, {"fallback-model", "a,a"}, {"fallback-model", "a,b,c,d,e,f,g,h,i"}, {"fallback-model", `[1]`},
	} {
		t.Run(tc.flag+tc.value, func(t *testing.T) {
			command := controlsCommand(t)
			_ = command.Flags().Set(tc.flag, tc.value)
			if _, err := runtimeControlsEnvironment(command); err == nil {
				t.Fatal("invalid runtime controls accepted")
			}
		})
	}
}
