package cmd

import (
	"fmt"
	"net"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/BitterSecurity/Decepticon/clients/launcher/internal/config"
)

type desktopModelRuntime struct {
	provider   string
	model      string
	keyEnv     string
	secret     string
	ollamaBase string
}

var desktopProviderKeys = map[string]string{
	"openai":       "OPENAI_API_KEY",
	"anthropic":    "ANTHROPIC_API_KEY",
	"google":       "GOOGLE_API_KEY",
	"minimax":      "MINIMAX_API_KEY",
	"deepseek":     "DEEPSEEK_API_KEY",
	"xai":          "XAI_API_KEY",
	"mistral":      "MISTRAL_API_KEY",
	"openrouter":   "OPENROUTER_API_KEY",
	"nvidia":       "NVIDIA_API_KEY",
	"moonshot":     "MOONSHOT_API_KEY",
	"zai":          "ZAI_API_KEY",
	"groq":         "GROQ_API_KEY",
	"cerebras":     "CEREBRAS_API_KEY",
	"together":     "TOGETHERAI_API_KEY",
	"fireworks":    "FIREWORKS_AI_API_KEY",
	"deepinfra":    "DEEPINFRA_API_KEY",
	"sambanova":    "SAMBANOVA_API_KEY",
	"alibaba":      "DASHSCOPE_API_KEY",
	"upstage":      "UPSTAGE_API_KEY",
	"cohere":       "COHERE_API_KEY",
	"huggingface":  "HUGGINGFACE_API_KEY",
	"nebius":       "NEBIUS_API_KEY",
	"novita":       "NOVITA_API_KEY",
	"siliconflow":  "SILICONFLOW_API_KEY",
	"requesty":     "REQUESTY_API_KEY",
	"vercel":       "VERCEL_AI_GATEWAY_API_KEY",
	"kilo":         "KILO_API_KEY",
	"opencode_zen": "OPENCODE_API_KEY",
	"chutes":       "CHUTES_API_KEY",
	"synthetic":    "SYNTHETIC_API_KEY",
	"ollama_cloud": "OLLAMA_CLOUD_API_KEY",
	"kimi_code":    "KIMI_API_KEY",
	"minimax_plan": "MINIMAX_API_KEY",
}

var desktopProviderPrefixes = map[string]string{
	"google":    "gemini",
	"nvidia":    "nvidia_nim",
	"together":  "together_ai",
	"fireworks": "fireworks_ai",
	"alibaba":   "dashscope",
}

func validDesktopModel(value string) bool {
	if len(value) < 3 || len(value) > 256 || !strings.Contains(value, "/") {
		return false
	}
	for _, ch := range value {
		if !(ch >= 'a' && ch <= 'z' || ch >= 'A' && ch <= 'Z' || ch >= '0' && ch <= '9' || strings.ContainsRune("_./:-", ch)) {
			return false
		}
	}
	return true
}

func parseDesktopRuntime(serve bool) (*desktopModelRuntime, error) {
	if !serve {
		return nil, nil
	}
	provider := os.Getenv("DECEPTICON_DESKTOP_PROVIDER")
	model := os.Getenv("DECEPTICON_DESKTOP_MODEL")
	key := os.Getenv("DECEPTICON_DESKTOP_API_KEY")
	if provider == "" && model == "" && key == "" {
		return nil, nil
	}
	if !validDesktopModel(model) {
		return nil, fmt.Errorf("select a valid Desktop model before starting the service")
	}
	if provider == "ollama" {
		if !strings.HasPrefix(model, "ollama_chat/") || key != "" {
			return nil, fmt.Errorf("Desktop Ollama requires an ollama_chat model and no API key")
		}
		base := os.Getenv("DECEPTICON_DESKTOP_OLLAMA_BASE")
		if base != "" {
			endpoint, err := url.Parse(base)
			if err != nil || endpoint.Scheme != "http" || endpoint.User != nil || endpoint.Path != "" || endpoint.RawQuery != "" || endpoint.Fragment != "" {
				return nil, fmt.Errorf("invalid native Local model relay")
			}
			address := net.ParseIP(endpoint.Hostname())
			port, err := strconv.Atoi(endpoint.Port())
			if address == nil || !address.IsPrivate() || err != nil || port < 1 || port > 65535 {
				return nil, fmt.Errorf("invalid native Local model relay")
			}
		}
		return &desktopModelRuntime{provider: provider, model: model, ollamaBase: base}, nil
	}
	if provider == "chatgpt" || provider == "claude_code" {
		prefix := "auth/gpt-"
		if provider == "claude_code" {
			prefix = "auth/claude-"
		}
		if !strings.HasPrefix(model, prefix) || key != "" {
			return nil, fmt.Errorf("Desktop subscription requires a matching auth model and no API key")
		}
		return &desktopModelRuntime{provider: provider, model: model}, nil
	}
	keyEnv, ok := desktopProviderKeys[provider]
	if !ok {
		return nil, fmt.Errorf("Desktop provider %q is not yet supported by the OSS model router", provider)
	}
	prefix := provider
	if alias := desktopProviderPrefixes[provider]; alias != "" {
		prefix = alias
	}
	if !strings.HasPrefix(model, prefix+"/") || len(key) < 16 || len(key) > 4096 || strings.IndexFunc(key, func(ch rune) bool { return ch <= ' ' || ch == 127 }) >= 0 {
		return nil, fmt.Errorf("Desktop model or credential is invalid for provider %q", provider)
	}
	return &desktopModelRuntime{provider: provider, model: model, keyEnv: keyEnv, secret: key}, nil
}

func writeDesktopRuntimeOverlay(home string, selected *desktopModelRuntime) (string, error) {
	image := os.Getenv("DECEPTICON_DESKTOP_AGENT_IMAGE")
	if image != "" {
		const prefix = "decepticon-desktop-agent:sha-"
		revision := strings.TrimPrefix(image, prefix)
		if !strings.HasPrefix(image, prefix) || len(revision) != 40 || strings.Trim(revision, "0123456789abcdef") != "" {
			return "", fmt.Errorf("invalid native Desktop agent image")
		}
	}
	policyEnv, policyMount, err := desktopPolicyOverlay()
	if err != nil {
		return "", err
	}
	file, err := os.CreateTemp(home, ".desktop-compose-*.yml")
	if err != nil {
		return "", fmt.Errorf("create Desktop runtime overlay: %w", err)
	}
	path := file.Name()
	defer file.Close()
	model := "${DECEPTICON_DESKTOP_MODEL:?Desktop model missing}"
	serviceEnv := "      DECEPTICON_MODEL: " + model + "\n" + "      DECEPTICON_DESKTOP_MODEL: " + model + "\n"
	if selected.provider == "ollama" {
		base := selected.ollamaBase
		if base == "" {
			base = "http://host.docker.internal:11434"
		}
		serviceEnv += "      OLLAMA_API_BASE: " + base + "\n"
		serviceEnv += "      OLLAMA_MODEL: " + strings.TrimPrefix(selected.model, "ollama_chat/") + "\n"
	} else if selected.provider == "chatgpt" {
		serviceEnv += "      DECEPTICON_AUTH_CHATGPT: 'true'\n"
		serviceEnv += "      DECEPTICON_AUTH_PRIORITY: openai_oauth\n"
	} else if selected.provider == "claude_code" {
		serviceEnv += "      DECEPTICON_AUTH_CLAUDE_CODE: 'true'\n"
		serviceEnv += "      DECEPTICON_AUTH_PRIORITY: anthropic_oauth\n"
	} else {
		serviceEnv += "      " + selected.keyEnv + ": ${DECEPTICON_DESKTOP_API_KEY:?Desktop credential missing}\n"
		if selected.provider == "google" {
			serviceEnv += "      GEMINI_API_KEY: ${DECEPTICON_DESKTOP_API_KEY:?Desktop credential missing}\n"
		}
	}
	agentEnv := serviceEnv
	if selected.provider == "ollama" {
		agentEnv += "      DECEPTICON_LLM__TIMEOUT: '600'\n"
	}
	agentService := "  langgraph:\n"
	if image != "" {
		agentService += "    image: " + image + "\n"
	}
	content := "services:\n  litellm:\n    environment:\n" + serviceEnv + agentService + "    environment:\n" + agentEnv + policyEnv + policyMount
	if err := config.ProtectPrivateFile(path); err != nil {
		os.Remove(path)
		return "", fmt.Errorf("protect Desktop runtime overlay: %w", err)
	}
	if _, err := file.WriteString(content); err != nil {
		os.Remove(path)
		return "", fmt.Errorf("write Desktop runtime overlay: %w", err)
	}
	return filepath.Clean(path), nil
}
