package cmd

import (
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/spf13/cobra"
)

func clearWorkflowEnvironment(t *testing.T) {
	t.Helper()
	for _, key := range []string{"DECEPTICON_WORKFLOW_ID", "DECEPTICON_WORKFLOW_VERSION", "DECEPTICON_PLANNING_WORKFLOW_ID", "DECEPTICON_PLANNING_WORKFLOW_VERSION"} {
		t.Setenv(key, "")
		if err := os.Unsetenv(key); err != nil {
			t.Fatal(err)
		}
	}
}

func TestWorkflowEnvironment_ResolvesTrustedSelectors(t *testing.T) {
	for _, tc := range []struct {
		name string
		env  string
		args []string
		want map[string]string
	}{
		{"default", "", nil, map[string]string{}},
		{
			"configured", "DECEPTICON_WORKFLOW_ID=pentest\nDECEPTICON_WORKFLOW_VERSION=1\nDECEPTICON_PLANNING_WORKFLOW_ID=planning\nDECEPTICON_PLANNING_WORKFLOW_VERSION=1\n", nil,
			map[string]string{"DECEPTICON_WORKFLOW_ID": "pentest", "DECEPTICON_WORKFLOW_VERSION": "1", "DECEPTICON_PLANNING_WORKFLOW_ID": "planning", "DECEPTICON_PLANNING_WORKFLOW_VERSION": "1"},
		},
		{
			"flag override", "DECEPTICON_WORKFLOW_ID=pentest\nDECEPTICON_WORKFLOW_VERSION=1\n",
			[]string{"--workflow", "custom_process", "--workflow-version", "v2.1+build-3"},
			map[string]string{"DECEPTICON_WORKFLOW_ID": "custom_process", "DECEPTICON_WORKFLOW_VERSION": "v2.1+build-3"},
		},
		{
			"configured ID with flag version", "DECEPTICON_WORKFLOW_ID=pentest\n",
			[]string{"--workflow-version", "2"},
			map[string]string{"DECEPTICON_WORKFLOW_ID": "pentest", "DECEPTICON_WORKFLOW_VERSION": "2"},
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			clearWorkflowEnvironment(t)
			// Given trusted configuration and optional operator flags.
			home := t.TempDir()
			t.Setenv("DECEPTICON_HOME", home)
			if err := os.WriteFile(filepath.Join(home, ".env"), []byte(tc.env), 0o600); err != nil {
				t.Fatal(err)
			}
			command := &cobra.Command{Use: "decepticon"}
			command.Flags().String("workflow", "", "")
			command.Flags().String("workflow-version", "", "")
			if err := command.ParseFlags(tc.args); err != nil {
				t.Fatal(err)
			}
			// When the launcher resolves its container environment.
			got, err := workflowEnvironment(command)
			// Then only trusted selections are forwarded, with flags taking precedence.
			if err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("got %v, want %v", got, tc.want)
			}
		})
	}
}

func TestWorkflowEnvironment_RejectsInvalidSelectionsBeforeStartup(t *testing.T) {
	for _, tc := range []struct {
		name, env string
		args      []string
	}{
		{"missing ID", "", []string{"--workflow-version", "1"}},
		{"empty ID", "", []string{"--workflow="}},
		{"path ID", "", []string{"--workflow", "../pentest"}},
		{"uppercase ID", "", []string{"--workflow", "Pentest"}},
		{"long ID", "", []string{"--workflow", strings.Repeat("a", 129)}},
		{"path version", "", []string{"--workflow", "pentest", "--workflow-version", "../1"}},
		{"long version", "", []string{"--workflow", "pentest", "--workflow-version", strings.Repeat("1", 129)}},
		{"configured version without ID", "DECEPTICON_WORKFLOW_VERSION=1\n", nil},
		{"configured invalid ID", "DECEPTICON_WORKFLOW_ID=../pentest\n", nil},
		{"planning version without ID", "DECEPTICON_PLANNING_WORKFLOW_VERSION=1\n", nil},
	} {
		t.Run(tc.name, func(t *testing.T) {
			clearWorkflowEnvironment(t)
			// Given an invalid selector, without any service configuration.
			home := t.TempDir()
			t.Setenv("DECEPTICON_HOME", home)
			if tc.env != "" {
				if err := os.WriteFile(filepath.Join(home, ".env"), []byte(tc.env), 0o600); err != nil {
					t.Fatal(err)
				}
			}
			command := &cobra.Command{Use: "decepticon"}
			command.Flags().String("workflow", "", "")
			command.Flags().String("workflow-version", "", "")
			if err := command.ParseFlags(tc.args); err != nil {
				t.Fatal(err)
			}
			// When the real startup entry point is called.
			err := runStart(command, nil)
			// Then it returns a selector error before onboarding or Docker lookup.
			if err == nil || !strings.Contains(strings.ToLower(err.Error()), "workflow") {
				t.Fatalf("expected workflow rejection, got %v", err)
			}
		})
	}
}

func TestWorkflowEnvironment_ProcessEnvironmentOverridesFileUnlessFlagProvided(t *testing.T) {
	for _, useFlag := range []bool{false, true} {
		t.Run(fmt.Sprint(useFlag), func(t *testing.T) {
			// Given file defaults and explicit process environment selectors.
			clearWorkflowEnvironment(t)
			home := t.TempDir()
			t.Setenv("DECEPTICON_HOME", home)
			t.Setenv("DECEPTICON_WORKFLOW_ID", "process_workflow")
			t.Setenv("DECEPTICON_WORKFLOW_VERSION", "2")
			t.Setenv("DECEPTICON_PLANNING_WORKFLOW_ID", "process_planning")
			t.Setenv("DECEPTICON_PLANNING_WORKFLOW_VERSION", "3")
			if err := os.WriteFile(filepath.Join(home, ".env"), []byte("DECEPTICON_WORKFLOW_ID=pentest\nDECEPTICON_WORKFLOW_VERSION=1\nDECEPTICON_PLANNING_WORKFLOW_ID=planning\n"), 0o600); err != nil {
				t.Fatal(err)
			}
			command := &cobra.Command{Use: "decepticon"}
			command.Flags().String("workflow", "", "")
			command.Flags().String("workflow-version", "", "")
			if useFlag {
				if err := command.ParseFlags([]string{"--workflow", "flag_workflow", "--workflow-version", "4"}); err != nil {
					t.Fatal(err)
				}
			}
			// When the launcher resolves its container environment.
			selected, err := workflowEnvironment(command)
			// Then flags win over process environment, which wins over file defaults.
			if err != nil {
				t.Fatal(err)
			}
			id, version := "process_workflow", "2"
			if useFlag {
				id, version = "flag_workflow", "4"
			}
			want := map[string]string{"DECEPTICON_WORKFLOW_ID": id, "DECEPTICON_WORKFLOW_VERSION": version, "DECEPTICON_PLANNING_WORKFLOW_ID": "process_planning", "DECEPTICON_PLANNING_WORKFLOW_VERSION": "3"}
			if !reflect.DeepEqual(selected, want) {
				t.Fatalf("got %v, want %v", selected, want)
			}
		})
	}
}
