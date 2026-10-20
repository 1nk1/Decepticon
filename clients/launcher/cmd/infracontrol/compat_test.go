package infracontrol

import "testing"

func TestCommandKeepsOpscontrolAlias(t *testing.T) {
	if Cmd.Name() != "infracontrol" {
		t.Fatalf("canonical command = %q", Cmd.Name())
	}
	found := false
	for _, alias := range Cmd.Aliases {
		if alias == "opscontrol" {
			found = true
		}
	}
	if !found {
		t.Fatal("old command alias missing")
	}
	if command, _, err := Cmd.Find([]string{"status"}); err != nil || command.Name() != "status" {
		t.Fatalf("status subcommand: %v %v", command, err)
	}
}
