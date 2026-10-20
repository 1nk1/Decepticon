package cmd

import (
	"errors"
	"fmt"
	"os"
	"strings"

	"github.com/PurpleAILAB/Decepticon/clients/launcher/internal/ui"
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

// levenshtein computes the edit distance between two strings, used to
// suggest the closest command name when an argument does not resolve.
func levenshtein(a, b string) int {
	ra, rb := []rune(strings.ToLower(a)), []rune(strings.ToLower(b))
	prev := make([]int, len(rb)+1)
	curr := make([]int, len(rb)+1)
	for j := range prev {
		prev[j] = j
	}
	for i := 1; i <= len(ra); i++ {
		curr[0] = i
		for j := 1; j <= len(rb); j++ {
			cost := 1
			if ra[i-1] == rb[j-1] {
				cost = 0
			}
			curr[j] = min(curr[j-1]+1, min(prev[j]+1, prev[j-1]+cost))
		}
		prev, curr = curr, prev
	}
	return prev[len(rb)]
}

// closestCommand returns the registered command name nearest to arg
// within the suggestion threshold, or "" when nothing is close enough.
func closestCommand(arg string) string {
	best, bestDist := "", -1
	for _, candidate := range rootCmd.Commands() {
		for _, name := range append([]string{candidate.Name()}, candidate.Aliases...) {
			dist := levenshtein(arg, name)
			if bestDist == -1 || dist < bestDist || (dist == bestDist && name == candidate.Name()) {
				best, bestDist = name, dist
			}
		}
	}
	if bestDist >= 0 && bestDist <= 2 {
		return best
	}
	return ""
}

// positionalArgError explains an unexpected positional argument on the
// root command. The root accepts ArbitraryArgs so `--resume` can be
// paired with a positional thread ID, which means typos and unknown
// commands land here instead of cobra's own unknown-command error.
func positionalArgError(args []string) error {
	if len(args) != 1 {
		return fmt.Errorf("unexpected arguments %q; to resume a session use --resume=<thread-id>, --resume (picker) or --continue", strings.Join(args, " "))
	}
	arg := args[0]
	if suggestion := closestCommand(arg); suggestion != "" {
		return fmt.Errorf("unknown command %q; did you mean %q? Run 'decepticon help' for the command list", arg, suggestion)
	}
	return fmt.Errorf("unexpected argument %q; to resume a session use --resume=%s, --resume (picker) or --continue. If you meant a command, run 'decepticon help' for the command list", arg, arg)
}
