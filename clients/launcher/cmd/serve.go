package cmd

import (
	"fmt"
	"strings"

	"github.com/spf13/cobra"
)

var serveEngagement string

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
	rootCmd.AddCommand(serveCmd)
}
