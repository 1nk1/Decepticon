package cmd

import (
	"fmt"

	"github.com/BitterSecurity/Decepticon/clients/launcher/internal/config"
	"github.com/BitterSecurity/Decepticon/clients/launcher/internal/engagement"
	"github.com/spf13/cobra"
)

var cancelCmd = &cobra.Command{
	Use:   "cancel <engagement-name|thread-id>",
	Short: "Cancel an engagement's active run",
	Long: `Cancel the active run of a (possibly background) engagement. The services
stay up — this stops the engagement's agent turn, not the stack; use
'decepticon stop' for the whole stack and 'decepticon cancel' again later
for a restarted run.

Read-only aside from the cancel itself. No active run is reported, not
treated as an error.`,
	Example: `  decepticon cancel my-engagement
  decepticon cancel 01a16679-e6af-4d09-a238-57ae6af4e79c`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		env, envErr := config.LoadEnv(config.EnvPath())
		if envErr != nil {
			env = map[string]string{}
		}
		baseURL := langgraphBaseURL(env)
		client := engagement.DefaultLogsClient()
		ctx := cmd.Context()

		threadID, err := engagement.ResolveThreadID(ctx, client, baseURL, args[0])
		if err != nil {
			return err
		}
		run, err := engagement.FindActiveRun(ctx, client, baseURL, threadID)
		if err != nil {
			return err
		}
		if run == nil {
			cmd.Printf("engagement %s has no active run — nothing to cancel.\n", args[0])
			return nil
		}
		if err := engagement.CancelRun(ctx, client, baseURL, threadID, run.RunID); err != nil {
			return fmt.Errorf("cancel run %s: %w", run.RunID, err)
		}
		cmd.Printf("Cancelling engagement %s (thread %s, run %s, was %s).\n",
			args[0], threadID, run.RunID, run.Status)
		cmd.Println("Services are still up — 'decepticon attach' to inspect, 'decepticon stop' to shut down.")
		return nil
	},
}

func init() { rootCmd.AddCommand(cancelCmd) }
