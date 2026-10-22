package cmd

import (
	"fmt"
	"strings"

	"github.com/spf13/cobra"
)

// Root accepts a positional thread ID with --resume; validate other positional
// input before booting services so typos are reported without side effects.
func validateRootArgs(args []string) error {
	if len(args) == 0 {
		return nil
	}
	if len(args) == 1 && resumeThread == "picker" {
		return nil
	}
	word := args[0]
	bestName, bestDistance := "", 4
	for _, command := range rootCmd.Commands() {
		for _, name := range append([]string{command.Name()}, command.Aliases...) {
			d := editDistance(strings.ToLower(word), strings.ToLower(name))
			if d < bestDistance {
				bestDistance, bestName = d, command.Name()
			}
		}
	}
	if bestName != "" && bestDistance <= 3 {
		return fmt.Errorf("unknown command %q; did you mean %q? Run 'decepticon help' for the command list", word, bestName)
	}
	return fmt.Errorf("unexpected arguments; use --resume=THREAD_ID, --resume to pick a session, or --continue")
}

func editDistance(a, b string) int {
	left, right := []rune(a), []rune(b)
	prior := make([]int, len(right)+1)
	for i := range prior {
		prior[i] = i
	}
	for i, c := range left {
		next := make([]int, len(right)+1)
		next[0] = i + 1
		for j, d := range right {
			cost := 1
			if c == d {
				cost = 0
			}
			next[j+1] = min(next[j]+1, prior[j+1]+1, prior[j]+cost)
		}
		prior = next
	}
	return prior[len(right)]
}

// Help text for secondary commands is kept with their existing behavior.
func decorateLauncherHelp() {
	docs := map[string][2]string{
		"doctor":       {"Check the local installation and services without changing them. The --json flag prints a machine-readable report with recovery hints.", "  decepticon doctor\n  decepticon doctor --json"},
		"update":       {"Update the installed Decepticon application and stack assets after checking the selected release channel.", "  decepticon update"},
		"stop":         {"Stop the Compose stack and its local supervisor while preserving installed configuration and data.", "  decepticon stop"},
		"remove":       {"Remove the local Decepticon installation. Review its flags before deleting stack data.", "  decepticon remove --help"},
		"onboard":      {"Prepare a local Decepticon installation and configure authentication and stack assets.", "  decepticon onboard"},
		"skill":        {"Install guidance for coding agents. Use skill install to select Claude Code, Codex, or both.", "  decepticon skill install --client both"},
		"install":      {"Install the Decepticon Agent Skill for selected coding agents; --from selects a local source and --force backs up a modified installation.", "  decepticon skill install --client claude\n  decepticon skill install --client codex"},
		"mcp":          {"Expose the running Decepticon stack to an MCP client through standard input and output.", "  decepticon mcp serve"},
		"serve":        {"Start the Desktop adapter for an existing local engagement. Run --help to inspect its required engagement and runtime flags.", "  decepticon serve --engagement NAME"},
		"infracontrol": {"Manage the host supervisor that owns container lifecycle operations. Existing service units and sockets retain their names; opscontrol remains an alias.", "  decepticon infracontrol status"},
		"kg-health":    {"Check the knowledge graph endpoint after the stack is running.", "  decepticon kg-health"},
	}
	var visit func(*cobra.Command)
	visit = func(command *cobra.Command) {
		if doc, ok := docs[command.Name()]; ok {
			if command.Name() == "serve" && command.Parent() != rootCmd {
				doc = [2]string{"Serve the running Decepticon stack as an MCP stdio endpoint for a configured client.", "  decepticon mcp serve"}
			}
			if command.Long == "" {
				command.Long = doc[0]
			}
			if command.Example == "" {
				command.Example = doc[1]
			}
		}
		for _, child := range command.Commands() {
			visit(child)
		}
	}
	visit(rootCmd)
}
