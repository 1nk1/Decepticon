package cmd

import (
	"fmt"

	"github.com/BitterSecurity/Decepticon/clients/launcher/internal/config"
	"github.com/BitterSecurity/Decepticon/clients/launcher/internal/migrate"
)

func bootstrapDesktopEnv() error {
	if config.EnvExists() {
		return nil
	}
	secrets, err := config.NewInstallationSecrets()
	if err != nil {
		return fmt.Errorf("generate service credentials: %w", err)
	}
	values := map[string]string{
		"DECEPTICON_MODEL_PROFILE": "eco",
		"DECEPTICON_TELEMETRY":     "off",
		"LANGSMITH_TRACING":        "false",
		"LITELLM_MASTER_KEY":       secrets.LiteLLMMasterKey,
		"LITELLM_SALT_KEY":         secrets.LiteLLMSaltKey,
		"POSTGRES_PASSWORD":        secrets.PostgresPassword,
		"NEO4J_PASSWORD":           secrets.Neo4jPassword,
	}
	if err := config.WriteEnvFromEmbed(config.EnvPath(), values); err != nil {
		return fmt.Errorf("write private service config: %w", err)
	}
	if err := migrate.MarkAcked(config.DecepticonHome(), migrate.TelemetryPolicyID); err != nil {
		return fmt.Errorf("record telemetry setting: %w", err)
	}
	return nil
}
