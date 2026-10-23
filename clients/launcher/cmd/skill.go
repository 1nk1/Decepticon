package cmd

import (
	"fmt"

	"github.com/BitterSecurity/Decepticon/clients/launcher/internal/agentskill"
	"github.com/spf13/cobra"
)

var skillOptions agentskill.Options

var skillCmd = &cobra.Command{
	Use:   "skill",
	Short: "Install Decepticon guidance for coding agents",
	Long: `Install the Decepticon Agent Skill for coding agents such as
Claude Code or Codex, so they know how to drive a running Decepticon
instance (status, health, logs, MCP tools, engagement workflows).`,
}

var skillInstallCmd = &cobra.Command{
	Use:   "install",
	Short: "Install the Decepticon Agent Skill for Claude Code or Codex",
	Long: `Install the Decepticon Agent Skill for Claude Code, Codex, or both.

The skill teaches a coding agent how to connect to a running
Decepticon instance: check status and health, read logs, use MCP
tools, and follow engagement workflow guidance.`,
	Example: `  decepticon skill install                  Install for Claude Code and Codex
  decepticon skill install --client claude  Install for Claude Code only
  decepticon skill install --client codex   Install for Codex only
  decepticon skill install --force          Back up and replace a modified skill`,
	Args: cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		skillOptions.Version = version
		paths, err := agentskill.Install(cmd.Context(), skillOptions)
		for _, path := range paths {
			fmt.Fprintln(cmd.OutOrStdout(), "Installed Decepticon Skill at", path)
		}
		return err
	},
}

func init() {
	skillInstallCmd.Flags().StringVar(&skillOptions.Client, "client", "both", "Coding agent: codex, claude, or both")
	skillInstallCmd.Flags().StringVar(&skillOptions.Source, "from", "", "Install from a local Decepticon Skill directory")
	skillInstallCmd.Flags().BoolVar(&skillOptions.Force, "force", false, "Back up and replace a modified Decepticon Skill")
	skillCmd.AddCommand(skillInstallCmd)
	rootCmd.AddCommand(skillCmd)
}
