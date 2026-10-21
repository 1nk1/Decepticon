package cmd

import (
	"fmt"
	"strings"

	"github.com/spf13/cobra"
)

var serveEngagement string
var serveBrowserDescriptor string
var serveBrowserRegistrations string

var serveCmd = &cobra.Command{
	Use:   "serve",
	Short: "Start the agent service for an existing engagement without opening the CLI",
	Long: `Start the Decepticon agent service for an existing engagement
workspace without attaching the interactive conversation CLI.

Used by the Desktop app (and scripted setups) to drive an engagement
programmatically. Requires --engagement; interactive users should use
'decepticon start' instead.`,
	Example: `  decepticon serve --engagement my-engagement
                                   Start the agent service for an existing engagement`,
	RunE: func(cmd *cobra.Command, args []string) error {
		slug := strings.TrimSpace(serveEngagement)
		if slug == "" {
			return fmt.Errorf("choose an existing engagement with --engagement")
		}
		return runStartMode(cmd, args, slug)
	},
}

func init() {
	serveCmd.Flags().StringVar(&serveEngagement, "engagement", "", "Existing engagement folder name")
	serveCmd.Flags().StringVar(&serveBrowserDescriptor, "browser-descriptor", "", "Trusted host-owned per-run browser descriptor")
	serveCmd.Flags().StringVar(&serveBrowserRegistrations, "browser-registrations", "", "Private host registration directory for API-generated run IDs")
	serveCmd.MarkFlagsMutuallyExclusive("browser-descriptor", "browser-registrations")
	rootCmd.AddCommand(serveCmd)
}
