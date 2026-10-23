package cmd

import (
	"github.com/BitterSecurity/Decepticon/clients/launcher/internal/compose"
	"github.com/BitterSecurity/Decepticon/clients/launcher/internal/ui"
	"github.com/spf13/cobra"
)

var healthCmd = &cobra.Command{
	Use:     "kg-health",
	Aliases: []string{"graph-health"},
	Short:   "Run LangGraph health diagnostics",
	Long: `Run LangGraph health diagnostics inside the running langgraph
service (python -m decepticon.tools.research.health) and print the
report. Exit code 0 when healthy, 1 otherwise.

The stack must be running: start it with 'decepticon start' first,
and inspect service logs with 'decepticon logs langgraph' when a
check fails.`,
	Example: `  decepticon kg-health                  Run diagnostics (also: decepticon graph-health)
  decepticon kg-health 2>/dev/null      Suppress container log noise`,
	RunE: func(cmd *cobra.Command, args []string) error {
		ui.Info("Running LangGraph health diagnostics...")
		return compose.New().Exec("langgraph", "python", "-m", "decepticon.tools.research.health")
	},
}

func init() {
	rootCmd.AddCommand(healthCmd)
}
