package engagement

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestCreateDirectEngagement_ReadyForRedWithoutPlan(t *testing.T) {
	// Given a name and operator-entered target, without prewritten scope.
	home := t.TempDir()
	// When creating the engagement.
	choice, err := createDirectEngagement(home, "direct-test", "https://example.com", time.Date(2026, 10, 18, 1, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatal(err)
	}
	// Then direct Red is ready, without optional planning documents.
	if choice.Mode != "red" || choice.AssistantID != AssistantDecepticon || choice.Target != "https://example.com" || !choice.AuthorizationConfirmed {
		t.Fatalf("unexpected choice: %+v", choice)
	}
	if !isRedApproved(home, "direct-test") {
		t.Fatal("new target scope is not approved")
	}
	if _, err := os.Stat(filepath.Join(choice.WorkspacePath, "plan", "conops.json")); !os.IsNotExist(err) {
		t.Fatalf("optional Plan unexpectedly required: %v", err)
	}
}

func TestCreateDirectEngagement_RejectsInvalidTargetWithoutWorkspace(t *testing.T) {
	for _, target := range []string{"", "example.com", "ftp://example.com", "https://user:secret@example.com", "https://*.example.com", "https://example.com/private", "https://example.com?q=1", "http://localhost:3000"} {
		t.Run(target, func(t *testing.T) {
			// Given an invalid or unenforceable direct web target.
			home := t.TempDir()
			// When creation is requested.
			_, err := createDirectEngagement(home, "invalid-target", target, time.Now())
			// Then no workspace or approval is created.
			if err == nil {
				t.Fatal("accepted invalid target")
			}
			if _, err := os.Stat(filepath.Join(home, "workspace", "invalid-target")); !os.IsNotExist(err) {
				t.Fatalf("workspace created: %v", err)
			}
		})
	}
}

func TestCreateDirectEngagement_PreservesExistingScope(t *testing.T) {
	// Given an already approved engagement.
	home := t.TempDir()
	mkApprovedScope(t, home, "existing-test")
	filename := filepath.Join(home, "workspace", "existing-test", "plan", "roe.json")
	before, err := os.ReadFile(filename)
	if err != nil {
		t.Fatal(err)
	}
	// When another creation uses the same name and a different URL.
	_, err = createDirectEngagement(home, "existing-test", "https://different.example.com", time.Now())
	// Then the existing scope and approval remain intact.
	if err == nil {
		t.Fatal("reused existing engagement")
	}
	after, err := os.ReadFile(filename)
	if err != nil {
		t.Fatal(err)
	}
	if string(before) != string(after) || !isRedApproved(home, "existing-test") {
		t.Fatal("existing scope or approval changed")
	}
}
