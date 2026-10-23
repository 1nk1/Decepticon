package cmd

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"time"

	"github.com/BitterSecurity/Decepticon/clients/launcher/internal/config"
	"github.com/BitterSecurity/Decepticon/clients/launcher/internal/health"
	"github.com/BitterSecurity/Decepticon/clients/launcher/internal/infracontrol"
	"github.com/spf13/cobra"
)

var errDoctorFailed = errors.New("required checks failed; see recovery commands in the doctor report")

type doctorCheck struct {
	Name     string `json:"name"`
	Required bool   `json:"required"`
	OK       bool   `json:"ok"`
	Detail   string `json:"detail"`
	Recovery string `json:"recovery,omitempty"`
}

type doctorReport struct {
	OK     bool          `json:"ok"`
	Checks []doctorCheck `json:"checks"`
}

func init() {
	command := &cobra.Command{
		Use:   "doctor",
		Short: "Read-only installation and service diagnostics",
		Long: `Run read-only diagnostics on the Decepticon installation.

It checks (in order): Docker presence and daemon response, Docker
Compose V2, configuration (.env and docker-compose.yml) and
authentication, LangGraph readiness, the opscontrol Unix socket and
daemon health, and optional blue-team monitoring endpoints.

With --deep, read-only runtime diagnostics also run inside the
langgraph container (python -m decepticon.diagnostics): KG store
reachability, Skillogy health, HITL/model-fallback slot resolution and
the MCP auth mode.

Nothing is modified. The command exits non-zero when a required check
fails; optional checks are reported but do not affect the exit code.`,
		Example: `  decepticon doctor           Run all diagnostics and print a report
  decepticon doctor --json    Print a machine-readable report for CI
  decepticon doctor --deep    Also run the in-container runtime diagnostics`,
		Args: cobra.NoArgs,
	}
	command.Flags().Bool("json", false, "Print a machine-readable report")
	command.Flags().Bool("deep", false, "Also run read-only runtime diagnostics inside the langgraph container (requires the stack)")
	command.RunE = func(cmd *cobra.Command, _ []string) error {
		report := diagnose(cmd.Context())
		if deep, err := cmd.Flags().GetBool("deep"); err != nil {
			return err
		} else if deep {
			addDeepRuntimeChecks(cmd.Context(), &report)
		}
		jsonOutput, err := cmd.Flags().GetBool("json")
		if err != nil {
			return err
		}
		if jsonOutput {
			if err := json.NewEncoder(cmd.OutOrStdout()).Encode(report); err != nil {
				return fmt.Errorf("write doctor report: %w", err)
			}
		} else {
			for _, check := range report.Checks {
				status := "ok"
				if !check.OK {
					status = "failed"
					if !check.Required {
						status = "optional"
					}
				}
				cmd.Printf("%s: %s — %s\n", check.Name, status, check.Detail)
				if check.Recovery != "" {
					cmd.Printf("  Recovery: %s\n", check.Recovery)
				}
			}
		}
		if !report.OK {
			return errDoctorFailed
		}
		return nil
	}
	rootCmd.AddCommand(command)
}

func diagnose(ctx context.Context) doctorReport {
	report := doctorReport{OK: true}
	add := func(name string, required, ok bool, detail, recovery string) {
		if ok {
			recovery = ""
		}
		report.Checks = append(report.Checks, doctorCheck{name, required, ok, detail, recovery})
		if required && !ok {
			report.OK = false
		}
	}
	_, err := exec.LookPath("docker")
	add("docker", true, err == nil, "Docker executable presence", "Open https://docs.docker.com/get-docker/ and install Docker; then run `docker version`")
	add("docker_daemon", true, doctorExec(ctx, "docker", "info", "--format", "{{.ServerVersion}}") == nil, "Docker daemon response (3s timeout)", "Start Docker Desktop or run `sudo systemctl start docker`; retry `decepticon doctor`")
	add("compose", true, doctorExec(ctx, "docker", "compose", "version") == nil, "Docker Compose V2 response (3s timeout)", "Install the Docker Compose plugin; verify with `docker compose version`")
	env, configErr := config.LoadEnv(config.EnvPath())
	_, composeErr := os.Stat(filepath.Join(config.DecepticonHome(), "docker-compose.yml"))
	add("config", true, configErr == nil && composeErr == nil, "Readable configuration and Compose file presence", "Run `decepticon onboard` for a new install; for existing installs inspect `decepticon status` before changing configuration")
	authOK := configErr == nil && config.ValidateAuth(env) == nil
	add("auth", true, authOK, "Configured authentication method (presence only; provider login validity is not tested)", "Run `decepticon onboard` to configure an authentication method")
	client := &http.Client{Timeout: 3 * time.Second, CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse }}
	graphCtx, cancelGraph := context.WithTimeout(ctx, 3*time.Second)
	graphErr := health.ProbeLangGraph(graphCtx, env)
	cancelGraph()
	graphDetail := "Host LangGraph HTTP and decepticon assistant ready"
	if graphErr != nil {
		graphDetail = graphErr.Error()
	}
	add("langgraph", true, graphErr == nil, graphDetail, "Inspect LANGGRAPH_PORT and Docker published ports; compare host connectivity with container health using `decepticon logs langgraph`; retry `decepticon start --no-update`")
	socket := infracontrol.HostSocketPath()
	info, socketErr := os.Stat(socket)
	add("opscontrol_socket", false, socketErr == nil && info.Mode()&os.ModeSocket != 0, "Opscontrol Unix socket presence", "Run `decepticon infracontrol status`; start with `decepticon start --no-update`")
	transport := &http.Transport{DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
		return (&net.Dialer{Timeout: 3 * time.Second}).DialContext(ctx, "unix", socket)
	}}
	defer transport.CloseIdleConnections()
	opsClient := &http.Client{Transport: transport, Timeout: 3 * time.Second}
	add("opscontrol", false, doctorHTTP(ctx, opsClient, "http://opscontrol/v1/health"), "Opscontrol daemon health response", "Run `decepticon infracontrol status`; inspect `decepticon logs`")
	for _, component := range []struct{ name, key, fallback string }{{"blue_sensor", "BLUE_SENSOR_URL", "http://127.0.0.1:18081"}, {"blue_monitor", "BLUE_MONITOR_URL", "http://127.0.0.1:18085"}} {
		endpoint := config.Get(env, component.key, component.fallback)
		detail := "No host endpoint configured; monitoring status unknown"
		ok := false
		if endpoint != "" {
			ok = doctorHTTP(ctx, client, endpoint+"/metrics")
			detail = "Configured host endpoint health response"
		}
		add(component.name, false, ok, detail, "Run `decepticon logs`; configure a host-reachable "+component.key+" and retry `decepticon doctor`")
	}
	return report
}

func doctorExec(ctx context.Context, name string, args ...string) error {
	ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	command := exec.CommandContext(ctx, name, args...)
	command.WaitDelay = time.Second
	return command.Run()
}

func doctorHTTP(ctx context.Context, client *http.Client, endpoint string) bool {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return false
	}
	response, err := client.Do(request)
	if err != nil {
		return false
	}
	defer response.Body.Close()
	return response.StatusCode >= 200 && response.StatusCode < 300
}
