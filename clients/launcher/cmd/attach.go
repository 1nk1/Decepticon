package cmd

import (
	"fmt"
	"strings"

	"github.com/PurpleAILAB/Decepticon/clients/launcher/internal/config"
	"github.com/PurpleAILAB/Decepticon/clients/launcher/internal/engagement"
	"github.com/PurpleAILAB/Decepticon/clients/launcher/internal/ui"
	"github.com/spf13/cobra"
)

// resolveEngagementOrList resolves an engagement slug for attach; with an
// empty slug it lists the available engagements and asks the operator to
// pick one.
func resolveEngagementOrList(slug string) (string, error) {
	home := config.DecepticonHome()
	entries, err := engagement.ScanEngagements(home)
	if err != nil {
		return "", fmt.Errorf("scan engagements: %w", err)
	}
	if len(entries) == 0 {
		return "", fmt.Errorf("no engagements yet; run 'decepticon start' to create one")
	}
	if slug != "" {
		for _, entry := range entries {
			if entry.Slug == slug {
				return slug, nil
			}
		}
		return "", fmt.Errorf("unknown engagement %q; available: %s",
			slug, engagementSlugs(entries))
	}
	return "", fmt.Errorf("choose an engagement: %s", engagementSlugs(entries))
}

func engagementSlugs(entries []engagement.EngagementEntry) string {
	names := make([]string, 0, len(entries))
	for _, entry := range entries {
		names = append(names, entry.Slug)
	}
	return strings.Join(names, ", ")
}

var attachCmd = &cobra.Command{
	Use:   "attach <engagement-name>",
	Short: "Open an existing engagement in the interactive CLI",
	Long: `Start the Decepticon services (if needed) and open the interactive
conversation CLI attached to an existing engagement workspace.

This is the counterpart of 'decepticon start --background': background
engagements are prepared without the CLI and attached here later. Supports
the same --resume/--continue session selection as 'decepticon start'.`,
	Example: `  decepticon attach my-engagement
  decepticon attach my-engagement --continue
  decepticon attach --resume=THREAD_ID my-engagement`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		slug := strings.TrimSpace(args[0])
		if slug == "" {
			return fmt.Errorf("engagement name is required; run 'decepticon engagements' to list")
		}
		if _, err := resolveEngagementOrList(slug); err != nil {
			return err
		}
		ui.Info("Attaching to engagement " + slug + "…")
		return runStartMode(cmd, nil, slug)
	},
}

var engagementsCmd = &cobra.Command{
	Use:   "engagements",
	Short: "List existing engagement workspaces",
	Long: `List engagement workspaces under the Decepticon home, with their
Red-approval state (whether an approved scope is present). Run
'decepticon attach <name>' to open one in the interactive CLI.`,
	Example: "  decepticon engagements\n  decepticon attach my-engagement",
	Args: cobra.NoArgs,
	RunE: func(cmd *cobra.Command, _ []string) error {
		entries, err := engagement.ScanEngagements(config.DecepticonHome())
		if err != nil {
			return fmt.Errorf("scan engagements: %w", err)
		}
		if len(entries) == 0 {
			ui.DimText("No engagements yet — run 'decepticon start' to create one.")
			return nil
		}
		for _, entry := range entries {
			state := "not approved"
			if entry.Ready {
				state = "red approved"
			}
			cmd.Printf("  %-40s %s\n", entry.Slug, state)
		}
		return nil
	},
}

func init() {
	rootCmd.AddCommand(attachCmd)
	rootCmd.AddCommand(engagementsCmd)
}