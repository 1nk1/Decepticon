package engagement

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/PurpleAILAB/Decepticon/clients/launcher/internal/ui"
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
// are never migrated or overwritten during creation. Targets and the optional
// denylist share the core builder's normalization contract (see
// scope_targets.go and the golden vectors).
func createDirectEngagement(home, slug, targetsInput, outOfScopeInput string, now time.Time) (Choice, error) {
	if err := validateSlug(home, slug); err != nil {
		return Choice{}, err
	}
	lists, err := buildScopeLists([]string{targetsInput}, []string{outOfScopeInput})
	if err != nil {
		return Choice{}, err
	}
	for _, dropped := range lists.Dropped {
		ui.Warning(fmt.Sprintf("Dropped target %q: no DNS/IP target can match it", dropped))
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
