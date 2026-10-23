package cmd

import "github.com/BitterSecurity/Decepticon/clients/launcher/cmd/infracontrol"

// Bridge the opscontrol subcommand tree into the launcher's rootCmd.
// Kept in a separate file so cmd/start.go and cmd/stop.go can import
// the opscontrol package directly (for EnsureRunning / Stop) without
// import cycles.
func init() {
	rootCmd.AddCommand(infracontrol.Cmd)
}
