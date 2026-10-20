package cmd

import (
	"encoding/json"

	"github.com/PurpleAILAB/Decepticon/clients/launcher/internal/compose"
	"github.com/spf13/cobra"
)

var statusCmd = &cobra.Command{
	Use:     "status",
	Short:   "Show Decepticon service status",
	Long:    "Show services in the current Decepticon Compose stack. Use --json for a JSON array suitable for scripts, including [] when no services are running.",
	Example: "  decepticon status\n  decepticon status --json",
	Args:    cobra.NoArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		asJSON, err := cmd.Flags().GetBool("json")
		if err != nil {
			return err
		}
		c := compose.New()
		if !asJSON {
			return c.Ps()
		}
		rows, err := c.PsJSON()
		if err != nil {
			return err
		}
		return json.NewEncoder(cmd.OutOrStdout()).Encode(rows)
	},
}

func init() {
	statusCmd.Flags().Bool("json", false, "Print service rows as a JSON array")
	rootCmd.AddCommand(statusCmd)
}
