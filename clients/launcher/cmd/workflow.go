package cmd

import (
	"fmt"
	"os"
	"regexp"

	"github.com/BitterSecurity/Decepticon/clients/launcher/internal/config"
	"github.com/spf13/cobra"
)

var (
	workflowIDPattern      = regexp.MustCompile(`^[a-z][a-z0-9_-]{0,127}$`)
	workflowVersionPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$`)
)

// workflowEnvironment parses trusted launch selectors before any startup effects.
func workflowEnvironment(cmd *cobra.Command) (map[string]string, error) {
	env := map[string]string{}
	if config.EnvExists() {
		loaded, err := config.LoadEnv(config.EnvPath())
		if err != nil {
			return nil, fmt.Errorf("load workflow config: %w", err)
		}
		env = loaded
	}
	selected := map[string]string{}
	for _, key := range []string{
		"DECEPTICON_WORKFLOW_ID", "DECEPTICON_WORKFLOW_VERSION",
		"DECEPTICON_PLANNING_WORKFLOW_ID", "DECEPTICON_PLANNING_WORKFLOW_VERSION",
	} {
		value := env[key]
		if inherited, exists := os.LookupEnv(key); exists {
			value = inherited
		}
		if value != "" {
			selected[key] = value
		}
	}
	for flag, key := range map[string]string{
		"workflow": "DECEPTICON_WORKFLOW_ID", "workflow-version": "DECEPTICON_WORKFLOW_VERSION",
	} {
		if cmd.Flags().Changed(flag) {
			value, err := cmd.Flags().GetString(flag)
			if err != nil {
				return nil, err
			}
			if value == "" {
				return nil, fmt.Errorf("--%s must not be empty", flag)
			}
			selected[key] = value
		}
	}
	for _, prefix := range []string{"DECEPTICON_WORKFLOW", "DECEPTICON_PLANNING_WORKFLOW"} {
		id, version := selected[prefix+"_ID"], selected[prefix+"_VERSION"]
		if version != "" && id == "" {
			return nil, fmt.Errorf("%s_VERSION requires %s_ID", prefix, prefix)
		}
		if id != "" && !workflowIDPattern.MatchString(id) {
			return nil, fmt.Errorf("invalid %s_ID: use 1-128 lowercase letters, digits, underscores or hyphens, starting with a letter", prefix)
		}
		if version != "" && !workflowVersionPattern.MatchString(version) {
			return nil, fmt.Errorf("invalid %s_VERSION: use 1-128 letters, digits, dots, underscores, plus signs or hyphens, starting with a letter or digit", prefix)
		}
	}
	return selected, nil
}
