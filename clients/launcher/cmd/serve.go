package cmd

import (
	"fmt"
	"strings"

	"github.com/spf13/cobra"
)

var serveEngagement string
var serveBrowserDescriptor string

var serveCmd = &cobra.Command{
	Use:   "serve",
	Short: "Start the agent service for an existing engagement without opening the CLI",
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
	rootCmd.AddCommand(serveCmd)
}
