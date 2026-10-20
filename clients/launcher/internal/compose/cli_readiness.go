package compose

import (
	"context"
	_ "embed"
	"errors"
	"fmt"
	"os/exec"
	"strconv"
	"strings"
	"time"

	"github.com/PurpleAILAB/Decepticon/clients/launcher/internal/health"
)

//go:embed cli_readiness.js
var cliReadinessScript string

// ProbeCLI checks the same service environment and network used by RunInteractive.
// Up has already reconciled the service configuration before this probe runs.
func (c *Compose) ProbeCLI(parent context.Context) error {
	ctx, cancel := context.WithTimeout(parent, 5*time.Second)
	defer cancel()
	if err := ctx.Err(); err != nil {
		return err
	}
	deadline, _ := ctx.Deadline()
	millis := max(1, time.Until(deadline).Milliseconds())
	args := append(c.baseArgs(), "exec", "-T", "cli", "node", "-e", cliReadinessScript, strconv.FormatInt(millis, 10), strconv.Itoa(health.MaxCatalogBytes))
	command := exec.CommandContext(ctx, c.Runtime.Bin, args...)
	command.Env = c.composeEnv()
	command.WaitDelay = 100 * time.Millisecond
	body, err := command.Output()
	if ctx.Err() != nil {
		return fmt.Errorf("LangGraph CLI route: %w", ctx.Err())
	}
	if err != nil {
		var exit *exec.ExitError
		if errors.As(err, &exit) {
			return fmt.Errorf("LangGraph CLI route: %w: %s", err, strings.TrimSpace(string(exit.Stderr)))
		}
		return fmt.Errorf("LangGraph CLI route: %w", err)
	}
	if err := health.ValidateAssistantCatalog(body); err != nil {
		return fmt.Errorf("LangGraph CLI route: %w", err)
	}
	return nil
}
