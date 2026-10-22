package engagement

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

type directScopeWindow struct {
	Start string `json:"start"`
	End   string `json:"end"`
}

// machineScope is the generated RoE: one machine-enforceable scope compiled
// from the creation inputs. There is no separate human scope document and no
// approval marker — creating the engagement with a scope IS the
// authorization, and the middleware enforces this block unconditionally.
type machineScope struct {
	Mode              string              `json:"mode"`
	InScope           []string            `json:"in_scope"`
	OutOfScope        []string            `json:"out_of_scope"`
	AuthorizedWindows []directScopeWindow `json:"authorized_windows"`
}

type machineRoeDocument struct {
	EngagementName     string       `json:"engagement_name"`
	MachineEnforcement machineScope `json:"machine_enforcement"`
}

// createDirectEngagement only owns a newly created workspace. Existing scopes
// are never migrated or overwritten during creation. The caller compiles the
// scope through the shared normalization contract (see scope_targets.go and
// the golden vectors) and shows it for review; dropped entries are surfaced
// in that preview, not re-reported here.
func createDirectEngagement(home, slug string, lists scopeLists, now time.Time) (Choice, error) {
	if err := validateSlug(home, slug); err != nil {
		return Choice{}, err
	}
	if len(lists.InScope) == 0 {
		return Choice{}, fmt.Errorf("engagement scope requires at least one in-scope target")
	}
	now = now.UTC()
	end := now.AddDate(0, 0, 7)
	document := machineRoeDocument{
		EngagementName: slug,
		MachineEnforcement: machineScope{
			Mode:              "enforce",
			InScope:           lists.InScope,
			OutOfScope:        lists.OutOfScope,
			AuthorizedWindows: []directScopeWindow{{Start: now.Format(time.RFC3339), End: end.Format(time.RFC3339)}},
		},
	}
	raw, err := json.MarshalIndent(document, "", "  ")
	if err != nil {
		return Choice{}, fmt.Errorf("encode direct scope: %w", err)
	}
	raw = append(raw, '\n')
	workspace := filepath.Join(home, "workspace")
	if err := os.MkdirAll(workspace, 0o700); err != nil {
		return Choice{}, fmt.Errorf("create workspace root: %w", err)
	}
	root := filepath.Join(workspace, slug)
	if err := os.Mkdir(root, 0o700); err != nil {
		return Choice{}, fmt.Errorf("create engagement: %w", err)
	}
	if err := os.Mkdir(filepath.Join(root, "plan"), 0o700); err != nil {
		return Choice{}, fmt.Errorf("create scope directory: %w", err)
	}
	if err := os.WriteFile(filepath.Join(root, "plan", "roe.json"), raw, 0o600); err != nil {
		return Choice{}, fmt.Errorf("write direct scope: %w", err)
	}
	return choiceForEngagement(home, slug), nil
}
