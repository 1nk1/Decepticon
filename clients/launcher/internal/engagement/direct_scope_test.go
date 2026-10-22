package engagement

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestCreateDirectEngagement_MachineScopeFromCreationData(t *testing.T) {
	// Given a name and operator-entered targets, without prewritten scope.
	home := t.TempDir()
	// When creating the engagement.
	choice, err := createDirectEngagement(home, "direct-test", "https://example.com/login, *.corp.example.com", "secret.corp.example.com", time.Date(2026, 10, 18, 1, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatal(err)
	}
	// Then direct Red is ready: creation is the authorization.
	if choice.Mode != "red" || choice.AssistantID != AssistantDecepticon || choice.Target != "example.com" || !choice.AuthorizationConfirmed {
		t.Fatalf("unexpected choice: %+v", choice)
	}
	if !scopeReady(home, "direct-test") {
		t.Fatal("new machine scope is not ready")
	}
	if _, err := os.Stat(filepath.Join(choice.WorkspacePath, ".red-approved")); !os.IsNotExist(err) {
		t.Fatalf("approval marker written: %v", err)
	}
	raw, err := os.ReadFile(filepath.Join(choice.WorkspacePath, "plan", "roe.json"))
	if err != nil {
		t.Fatal(err)
	}
	var doc machineRoeDocument
	if err := json.Unmarshal(raw, &doc); err != nil {
		t.Fatal(err)
	}
	if doc.EngagementName != "direct-test" {
		t.Fatalf("unexpected engagement name: %q", doc.EngagementName)
	}
	want := []string{"example.com", "*.corp.example.com", "corp.example.com"}
	if fmt.Sprint(doc.MachineEnforcement.InScope) != fmt.Sprint(want) {
		t.Fatalf("unexpected in_scope: %v", doc.MachineEnforcement.InScope)
	}
	if fmt.Sprint(doc.MachineEnforcement.OutOfScope) != fmt.Sprint([]string{"secret.corp.example.com"}) {
		t.Fatalf("unexpected out_of_scope: %v", doc.MachineEnforcement.OutOfScope)
	}
	if doc.MachineEnforcement.Mode != "enforce" || len(doc.MachineEnforcement.AuthorizedWindows) != 1 {
		t.Fatalf("unexpected machine scope: %+v", doc.MachineEnforcement)
	}
}

func TestCreateDirectEngagement_RejectsEmptyScopeWithoutWorkspace(t *testing.T) {
	for _, targets := range []string{"", "*.", "   ", ".."} {
		t.Run(targets, func(t *testing.T) {
			// Given targets that yield no in-scope pattern.
			home := t.TempDir()
			// When creation is requested.
			_, err := createDirectEngagement(home, "invalid-target", targets, "", time.Now())
			// Then no workspace is created.
			if err == nil {
				t.Fatal("accepted scopeless creation")
			}
			if _, err := os.Stat(filepath.Join(home, "workspace", "invalid-target")); !os.IsNotExist(err) {
				t.Fatalf("workspace created: %v", err)
			}
		})
	}
}

func TestCreateDirectEngagement_RejectsNonASCIITarget(t *testing.T) {
	home := t.TempDir()
	if _, err := createDirectEngagement(home, "idn-target", "엘리스.io", "", time.Now()); err == nil {
		t.Fatal("accepted a non-ASCII hostname")
	}
}

func TestCreateDirectEngagement_PreservesExistingScope(t *testing.T) {
	// Given an already created engagement.
	home := t.TempDir()
	mkApprovedScope(t, home, "existing-test")
	filename := filepath.Join(home, "workspace", "existing-test", "plan", "roe.json")
	before, err := os.ReadFile(filename)
	if err != nil {
		t.Fatal(err)
	}
	// When another creation uses the same name.
	_, err = createDirectEngagement(home, "existing-test", "https://different.example.com", "", time.Now())
	// Then the existing scope remains intact.
	if err == nil {
		t.Fatal("reused existing engagement")
	}
	after, err := os.ReadFile(filename)
	if err != nil {
		t.Fatal(err)
	}
	if string(before) != string(after) || !scopeReady(home, "existing-test") {
		t.Fatal("existing scope changed")
	}
}

// TestCreateDirectEngagement_GoldenVectors pins the launcher's target
// normalization to the shared contract consumed by the Python builder tests
// (packages/decepticon-core/tests/testdata/roe-target-vectors.json).
func TestCreateDirectEngagement_GoldenVectors(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("..", "..", "..", "..", "packages", "decepticon-core", "tests", "testdata", "roe-target-vectors.json"))
	if err != nil {
		t.Fatal(err)
	}
	var doc struct {
		Cases []struct {
			Name       string   `json:"name"`
			Targets    []string `json:"targets"`
			OutOfScope []string `json:"out_of_scope"`
			InScope    []string `json:"in_scope"`
			Out        []string `json:"out"`
		} `json:"cases"`
	}
	if err := json.Unmarshal(raw, &doc); err != nil {
		t.Fatal(err)
	}
	if len(doc.Cases) == 0 {
		t.Fatal("no golden vectors found")
	}
	for i, tc := range doc.Cases {
		t.Run(tc.Name, func(t *testing.T) {
			home := t.TempDir()
			slug := fmt.Sprintf("vector-%02d", i)
			if _, err := createDirectEngagement(home, slug, strings.Join(tc.Targets, ", "), strings.Join(tc.OutOfScope, ", "), time.Now()); err != nil {
				t.Fatalf("create: %v", err)
			}
			raw, err := os.ReadFile(filepath.Join(home, "workspace", slug, "plan", "roe.json"))
			if err != nil {
				t.Fatal(err)
			}
			var got machineRoeDocument
			if err := json.Unmarshal(raw, &got); err != nil {
				t.Fatal(err)
			}
			if fmt.Sprint(got.MachineEnforcement.InScope) != fmt.Sprint(tc.InScope) {
				t.Fatalf("in_scope mismatch:\n got %v\nwant %v", got.MachineEnforcement.InScope, tc.InScope)
			}
			if fmt.Sprint(got.MachineEnforcement.OutOfScope) != fmt.Sprint(tc.Out) {
				t.Fatalf("out_of_scope mismatch:\n got %v\nwant %v", got.MachineEnforcement.OutOfScope, tc.Out)
			}
		})
	}
}
