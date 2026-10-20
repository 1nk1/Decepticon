package cmd

import (
	"errors"
	"fmt"
	"os"

	"github.com/PurpleAILAB/Decepticon/clients/launcher/internal/ui"
	"github.com/spf13/cobra"
)

var version = "dev"

var rootCmd = &cobra.Command{
	Use:     "decepticon",
	Args:    cobra.ArbitraryArgs,
	Short:   "Decepticon — Autonomous Hacking Agent for Red Team",
	Long:    ui.RenderBanner() + "\n" + ui.Dim.Render("Autonomous Hacking Agent for Red Team") + "\n\nStart a session: decepticon start\nInspect services: decepticon status or decepticon doctor\nFollow logs: decepticon logs [service]",
	Example: "  decepticon start\n  decepticon doctor --json\n  decepticon logs langgraph",
	CompletionOptions: cobra.CompletionOptions{
		HiddenDefaultCmd: true,
	},
	SilenceUsage:  true,
	SilenceErrors: true,
}

func Execute() {
	decorateLauncherHelp()
	command, err := rootCmd.ExecuteC()
	if err != nil {
		if errors.Is(err, errDoctorFailed) {
			os.Exit(1)
		}
		if command == mcpServeCmd {
			fmt.Fprintln(os.Stderr, err)
		} else {
			ui.Error(err.Error())
		}
		os.Exit(1)
	}
}

func init() {
	rootCmd.Version = version
	rootCmd.SetVersionTemplate(fmt.Sprintf("Decepticon %s\n", version))
}
