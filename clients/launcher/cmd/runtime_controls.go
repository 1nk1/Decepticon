package cmd

import (
	"encoding/json"
	"fmt"
	"os"
	"regexp"
	"strconv"
	"strings"

	"github.com/BitterSecurity/Decepticon/clients/launcher/internal/config"
	"github.com/spf13/cobra"
)

var runtimeModelID = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._:/+@-]{0,255}$`)

func runtimeControlsEnvironment(cmd *cobra.Command) (map[string]string, error) {
	loaded := map[string]string{}
	if config.EnvExists() {
		values, err := config.LoadEnv(config.EnvPath())
		if err != nil {
			return nil, fmt.Errorf("load runtime controls: %w", err)
		}
		loaded = values
	}
	selected := map[string]string{}
	for flag, key := range map[string]string{
		"fallback-model": "DECEPTICON_LLM__FALLBACK_MODELS",
		"effort":         "DECEPTICON_LLM__EFFORT",
		"autocompact":    "DECEPTICON_LLM__AUTOCOMPACT",
	} {
		value := loaded[key]
		if inherited, exists := os.LookupEnv(key); exists {
			value = inherited
		}
		if cmd.Flags().Changed(flag) {
			chosen, err := cmd.Flags().GetString(flag)
			if err != nil {
				return nil, err
			}
			if strings.TrimSpace(chosen) == "" {
				return nil, fmt.Errorf("--%s must not be empty", flag)
			}
			value = chosen
		}
		if value = strings.TrimSpace(value); value != "" {
			selected[key] = value
		}
	}
	if raw, ok := selected["DECEPTICON_LLM__FALLBACK_MODELS"]; ok {
		var models []string
		switch raw {
		case "auto", "null":
			selected["DECEPTICON_LLM__FALLBACK_MODELS"] = "null"
		default:
			if raw == "none" {
				models = []string{}
			} else if strings.HasPrefix(raw, "[") {
				if err := json.Unmarshal([]byte(raw), &models); err != nil {
					return nil, fmt.Errorf("fallback models must be a model list, auto or none")
				}
			} else {
				for _, value := range strings.Split(raw, ",") {
					models = append(models, strings.TrimSpace(value))
				}
			}
			if len(models) > 8 {
				return nil, fmt.Errorf("fallback models allow at most 8 IDs")
			}
			seen := map[string]bool{}
			for _, model := range models {
				if !runtimeModelID.MatchString(model) || seen[model] {
					return nil, fmt.Errorf("fallback models must be unique valid model IDs")
				}
				seen[model] = true
			}
			encoded, err := json.Marshal(models)
			if err != nil {
				return nil, err
			}
			selected["DECEPTICON_LLM__FALLBACK_MODELS"] = string(encoded)
		}
	}
	if effort, ok := selected["DECEPTICON_LLM__EFFORT"]; ok {
		switch effort {
		case "auto", "low", "medium", "high", "max":
		default:
			return nil, fmt.Errorf("effort must be auto, low, medium, high or max")
		}
	}
	if compact, ok := selected["DECEPTICON_LLM__AUTOCOMPACT"]; ok && compact != "auto" {
		tokens, err := strconv.Atoi(compact)
		if err != nil || !regexp.MustCompile(`^[0-9]+$`).MatchString(compact) || tokens < 1024 || tokens > 10000000 {
			return nil, fmt.Errorf("autocompact must be auto or 1024–10000000 tokens")
		}
		selected["DECEPTICON_LLM__AUTOCOMPACT"] = strconv.Itoa(tokens)
	}
	return selected, nil
}
