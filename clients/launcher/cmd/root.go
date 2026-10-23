package cmd

import (
	"errors"
	"fmt"
	"os"

	"github.com/BitterSecurity/Decepticon/clients/launcher/internal/ui"
	"github.com/spf13/cobra"
)

var version = "dev"

var rootCmd = &cobra.Command{
	Use:   "decepticon",
	Args:  cobra.ArbitraryArgs,
	Short: "Decepticon — Autonomous Hacking Agent for Red Team",
	Long: ui.RenderBanner() + "\n" + ui.Dim.Render("Autonomous Hacking Agent for Red Team") + `

Start an authorized red-team session:
  decepticon                        Boot services and open the conversation
                                    (first launch runs the onboard wizard)
  decepticon --continue             Continue the latest session
  decepticon --resume               Open the interactive session picker
  decepticon --resume=<thread-id>   Resume a specific thread

Manage the stack and installation:
  decepticon status                 Show running services (--json for scripts)
  decepticon logs langgraph         Follow the agent service logs
  decepticon doctor                 Diagnose the installation (--json for CI)
  decepticon update                 Check for updates and apply them
  decepticon stop                   Stop all services (a CLI exit keeps them
                                    running so the next start is fast)

Run 'decepticon <command> --help' for details on a command.`,
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
