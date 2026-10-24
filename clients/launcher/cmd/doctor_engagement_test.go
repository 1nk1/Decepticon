package cmd

import (
	"strings"
	"testing"
)

func TestDoctorEngagementValidationPrecedesHostProbes(t *testing.T) {
	command, _, err := rootCmd.Find([]string{"doctor"})
	if err != nil {
		t.Fatal(err)
	}
	previous := command.Flags().Lookup("engagement").Value.String()
	previousDeep := command.Flags().Lookup("deep").Value.String()
	t.Cleanup(func() { _ = command.Flags().Set("engagement", previous); _ = command.Flags().Set("deep", previousDeep) })
	_ = command.Flags().Set("deep", "false")
	for _, value := range []string{"../escape", "ab", "valid-name"} {
		_ = command.Flags().Set("engagement", value)
		err := command.RunE(command, nil)
		if err == nil || (!strings.Contains(err.Error(), "invalid engagement") && !strings.Contains(err.Error(), "requires --deep")) {
			t.Fatalf("%q unexpectedly reached host probes: %v", value, err)
		}
	}
}
