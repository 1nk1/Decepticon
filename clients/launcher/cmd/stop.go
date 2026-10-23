package cmd

import (
	"github.com/BitterSecurity/Decepticon/clients/launcher/cmd/infracontrol"
	"github.com/BitterSecurity/Decepticon/clients/launcher/internal/compose"
	"github.com/BitterSecurity/Decepticon/clients/launcher/internal/ui"
	"github.com/spf13/cobra"
)

var stopCmd = &cobra.Command{
	Use:   "stop",
	Short: "Stop all Decepticon services",
	Long: `Stop every Decepticon service, including the opscontrol daemon.

Stops and removes all Compose containers across every workload
profile, then tears down the opscontrol daemon. Conversations and
workspace data are kept; only the running services are stopped.`,
	Example: `  decepticon stop    Stop all Decepticon services and the daemon`,
	RunE: func(cmd *cobra.Command, args []string) error {
		c := compose.New()
		ui.Info("Stopping Decepticon services...")
		c.RemoveOrphanedCLI()
		// Clear legacy root-level scratch/session buffers before tearing the
		// stack down. Current runs keep these under engagement workspaces.
		c.CleanScratch()
		if err := c.Down(); err != nil {
			return err
		}
		// Tear down the infracontrol daemon after compose so any
		// workload it owned has already been removed by `compose down`.
		// Non-fatal: a never-started daemon is a no-op here.
		if err := infracontrol.Stop(); err != nil {
			ui.Warning("infracontrol stop: " + err.Error())
		}
		ui.Success("All services stopped")
		return nil
	},
}

func init() {
	rootCmd.AddCommand(stopCmd)
}
