package cmd

import (
	"strings"
	"testing"
)

func TestRootArgumentErrorsBeforeBoot(t *testing.T) {
	old := resumeThread
	t.Cleanup(func() { resumeThread = old })
	resumeThread = ""
	if err := validateRootArgs([]string{"startatd"}); err == nil || !strings.Contains(err.Error(), `did you mean "start"`) {
		t.Fatalf("typo: %v", err)
	}
	if err := validateRootArgs([]string{"arbitrary-thread"}); err == nil || !strings.Contains(err.Error(), "--resume=THREAD_ID") {
		t.Fatalf("thread hint: %v", err)
	}
	resumeThread = "picker"
	if err := validateRootArgs([]string{"thread-123"}); err != nil {
		t.Fatalf("picker positional ID: %v", err)
	}
}

func TestLauncherHelpDescribesCommands(t *testing.T) {
	decorateLauncherHelp()
	for _, command := range rootCmd.Commands() {
		if command.Hidden || command.Name() == "help" {
			continue
		}
		if command.Long == "" || command.Example == "" {
			t.Errorf("%s missing long help or example", command.Name())
		}
	}
	if !strings.Contains(startCmd.Use, "thread-id") {
		t.Fatal("start positional ID missing from usage")
	}
}

func TestRootArgumentSuggestionRejectsDistantTypos(t *testing.T) {
	// Given a root argument four edits away from start.
	old := resumeThread
	t.Cleanup(func() { resumeThread = old })
	resumeThread = ""
	// When the actual startup validator classifies the argument.
	err := validateRootArgs([]string{"staaaaart"})
	// Then it retains resume guidance without an overly distant command suggestion.
	if err == nil || strings.Contains(err.Error(), "did you mean") || !strings.Contains(err.Error(), "--resume=THREAD_ID") {
		t.Fatalf("distant typo: %v", err)
	}
}

func TestDocumentedLogService(t *testing.T) {
	if !isDocumentedLogService("langgraph") || isDocumentedLogService("postgresx") {
		t.Fatal("service catalog mismatch")
	}
}
