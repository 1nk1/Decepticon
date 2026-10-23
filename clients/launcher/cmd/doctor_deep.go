package cmd

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"time"

	"github.com/PurpleAILAB/Decepticon/clients/launcher/internal/compose"
)

// deepRuntimeReport mirrors packages/decepticon/decepticon/diagnostics.py.
type deepRuntimeReport struct {
	OK     bool `json:"ok"`
	Components map[string]struct {
		OK     bool `json:"ok"`
		Detail string `json:"detail"`
	} `json:"components"`
	SlotMatrix map[string]struct {
		Resolved []string          `json:"resolved"`
		Absent   map[string]string `json:"absent"`
	} `json:"slot_matrix"`
}

// addDeepRuntimeChecks runs the read-only diagnostics module inside the
// langgraph container (python -m decepticon.diagnostics) and folds the
// result into the doctor report. Missing stack is not an error here: the
// base checks already report service status.
func addDeepRuntimeChecks(ctx context.Context, report *doctorReport) {
	c := compose.New()
	if _, err := os.Stat(c.ComposeFile); err != nil {
		report.Checks = append(report.Checks, doctorCheck{
			Name: "runtime_deep", Required: false, OK: false,
			Detail: "Compose file missing; runtime diagnostics skipped",
		})
		return
	}
	probeCtx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()
	out, execErr := c.ExecCapture(probeCtx, "langgraph", "python", "-m", "decepticon.diagnostics")
	var parsed deepRuntimeReport
	parseErr := json.Unmarshal(trimJSON(out), &parsed)
	if execErr != nil && parseErr != nil {
		// No report at all — a real crash (container down, module missing).
		report.Checks = append(report.Checks, doctorCheck{
			Name: "runtime_deep", Required: false, OK: false,
			Detail: fmt.Sprintf("runtime diagnostics failed: %v", execErr),
			Recovery: "Start services with `decepticon start --no-update` and retry `decepticon doctor --deep`",
		})
		return
	}
	if parseErr != nil {
		report.Checks = append(report.Checks, doctorCheck{
			Name: "runtime_deep", Required: false, OK: false,
			Detail: fmt.Sprintf("runtime diagnostics returned invalid JSON: %v", parseErr),
		})
		return
	}
	// A non-zero exit with a parseable report means a required component is
	// unhealthy, not that diagnostics crashed — the per-component checks
	// below carry the details the operator needs.

	for _, name := range []string{"kg", "skillogy", "hitl", "model_fallback", "mcp_auth"} {
		component, exists := parsed.Components[name]
		if !exists {
			continue
		}
		report.Checks = append(report.Checks, doctorCheck{
			Name:     fmt.Sprintf("runtime_%s", name),
			Required: false,
			OK:       component.OK,
			Detail:   component.Detail,
			Recovery: recoveryHintFor(name),
		})
	}

	absentSummary := summarizeAbsentRoles(parsed.SlotMatrix)
	report.Checks = append(report.Checks, doctorCheck{
		Name: "runtime_slot_matrix", Required: false, OK: true,
		Detail: fmt.Sprintf("%d roles evaluated; conditional slots absent in: %s",
			len(parsed.SlotMatrix), absentSummary),
	})
}

func trimJSON(out []byte) []byte {
	start := 0
	for start < len(out) && out[start] != '{' && out[start] != '[' {
		start++
	}
	return out[start:]
}

func recoveryHintFor(name string) string {
	switch name {
	case "kg":
		return "Set DECEPTICON_NEO4J_* in .env and verify the stack with `decepticon start --no-update`; the KG slot stays absent until reachable"
	case "skillogy":
		return "Check the skillogy service (`decepticon logs skillogy`); with DECEPTICON_USE_SKILLOGY off the filesystem fallback is active"
	case "hitl":
		return "Set DECEPTICON_HITL__ENABLED=1 to enable human-in-the-loop approvals"
	case "model_fallback":
		return "Set DECEPTICON_MODEL_<ROLE>_FALLBACK chains to enable model fallback"
	case "mcp_auth":
		return "Set DECEPTICON_MCP_TOKEN to require shared-secret auth on the MCP bridge"
	default:
		return ""
	}
}

func summarizeAbsentRoles(matrix map[string]struct {
	Resolved []string          `json:"resolved"`
	Absent   map[string]string `json:"absent"`
}) string {
	counts := map[string]int{}
	for _, role := range matrix {
		for slot := range role.Absent {
			counts[slot]++
		}
	}
	summary := ""
	for slot, count := range counts {
		if summary != "" {
			summary += ", "
		}
		summary += fmt.Sprintf("%s (%d roles)", slot, count)
	}
	if summary == "" {
		return "none"
	}
	return summary
}
