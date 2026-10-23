package cmd

import (
	"fmt"
	"strings"

	"github.com/BitterSecurity/Decepticon/clients/launcher/internal/compose"
	"github.com/spf13/cobra"
)

var documentedLogServices = []string{"langgraph", "litellm", "postgres", "neo4j", "sandbox", "web"}

var logsCmd = &cobra.Command{
	Use:   "logs [service]",
	Short: "Follow service logs",
	Long: `Follow logs for one service in the current Compose stack. The default is langgraph.
Documented services: langgraph, litellm, postgres, neo4j, sandbox, web.
Additional stack services (such as cli or c2-sliver) are accepted when present in Compose configuration.`,
	Example: "  decepticon logs\n  decepticon logs litellm\n  decepticon logs cli",
	Args:    cobra.MaximumNArgs(1),
	ValidArgsFunction: func(cmd *cobra.Command, args []string, toComplete string) ([]string, cobra.ShellCompDirective) {
		if len(args) > 0 {
			return nil, cobra.ShellCompDirectiveNoFileComp
		}
		names, err := compose.New().ServiceNames()
		if err != nil {
			names = documentedLogServices
		}
		return names, cobra.ShellCompDirectiveNoFileComp
	},
	RunE: func(cmd *cobra.Command, args []string) error {
		service := "langgraph"
		if len(args) > 0 {
			service = args[0]
		}
		if !isDocumentedLogService(service) {
			names, err := compose.New().ServiceNames()
			if err != nil {
				return fmt.Errorf("validate service %q: %w", service, err)
			}
			found := false
			for _, name := range names {
				if name == service {
					found = true
					break
				}
			}
			if !found {
				return fmt.Errorf("unknown service %q; documented services: %s", service, strings.Join(documentedLogServices, ", "))
			}
		}
		return compose.New().Logs(service)
	},
}

func isDocumentedLogService(name string) bool {
	for _, known := range documentedLogServices {
		if name == known {
			return true
		}
	}
	return false
}

func init() { rootCmd.AddCommand(logsCmd) }
