package engagement

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// parseDirectWebTarget follows the existing host-level RoE URL contract.
func parseDirectWebTarget(value string) (string, error) {
	target := strings.TrimSpace(value)
	u, err := url.Parse(target)
	if err != nil {
		return "", fmt.Errorf("parse target URL: %w", err)
	}
	if (u.Scheme != "http" && u.Scheme != "https") || u.Hostname() == "" || strings.Contains(u.Hostname(), "*") || u.User != nil ||
		(u.Path != "" && u.Path != "/") || u.RawQuery != "" || u.ForceQuery || u.Fragment != "" || strings.ContainsAny(target, " \t\r\n") {
		return "", fmt.Errorf("enter a root HTTP or HTTPS URL without credentials, a path, query or fragment")
	}
	if port := u.Port(); port != "" && !((u.Scheme == "http" && port == "80") || (u.Scheme == "https" && port == "443")) {
		return "", fmt.Errorf("direct URL scope currently supports default ports only (HTTP 80 or HTTPS 443)")
	}
	return u.String(), nil
}

type directScopeEntry struct {
	Target string `json:"target"`
	Type   string `json:"type"`
}

type directScopeWindow struct {
	Start string `json:"start"`
	End   string `json:"end"`
}

type directScopeEnforcement struct {
	Mode              string              `json:"mode"`
	InScope           []directScopeEntry  `json:"in_scope"`
	AuthorizedWindows []directScopeWindow `json:"authorized_windows"`
}

type directScopeDocument struct {
	EngagementName         string                 `json:"engagement_name"`
	Client                 string                 `json:"client"`
	StartDate              string                 `json:"start_date"`
	EndDate                string                 `json:"end_date"`
	EngagementType         string                 `json:"engagement_type"`
	TestingWindow          string                 `json:"testing_window"`
	InScope                []directScopeEntry     `json:"in_scope"`
	AuthorizationReference string                 `json:"authorization_reference"`
	MachineEnforcement     directScopeEnforcement `json:"machine_enforcement"`
}

// createDirectEngagement only owns a newly created workspace. Existing scopes
// and their approval markers are never migrated or overwritten during creation.
func createDirectEngagement(home, slug, rawTarget string, now time.Time) (Choice, error) {
	if err := validateSlug(home, slug); err != nil {
		return Choice{}, err
	}
	target, err := parseDirectWebTarget(rawTarget)
	if err != nil {
		return Choice{}, err
	}
	now = now.UTC()
	end := now.AddDate(0, 0, 7)
	scope := []directScopeEntry{{Target: target, Type: "auto"}}
	document := directScopeDocument{
		EngagementName:         slug,
		Client:                 "Operator-authorized target",
		StartDate:              now.Format(time.DateOnly),
		EndDate:                end.Format(time.DateOnly),
		EngagementType:         "external",
		TestingWindow:          "Active immediately when Red starts, until " + end.Format(time.RFC3339),
		InScope:                scope,
		AuthorizationReference: "direct_operator_attestation",
		MachineEnforcement: directScopeEnforcement{
			Mode:              "enforce",
			InScope:           scope,
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
	digest := sha256.Sum256(raw)
	if err := os.WriteFile(filepath.Join(root, ".red-approved"), []byte("roe:"+hex.EncodeToString(digest[:])+"\n"), 0o600); err != nil {
		return Choice{}, fmt.Errorf("approve direct scope: %w", err)
	}
	return choiceForEngagement(home, slug), nil
}
