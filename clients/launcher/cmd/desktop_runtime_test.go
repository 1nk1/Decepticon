package cmd

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestDesktopNativeAccountFileIsExplicitAndProviderScoped(t *testing.T) {
	profile := filepath.Join(t.TempDir(), "account.json")
	if err := os.WriteFile(profile, []byte(`{"tokens":{}}`), 0600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("DECEPTICON_DESKTOP_PROVIDER", "chatgpt")
	t.Setenv("DECEPTICON_DESKTOP_MODEL", "auth/gpt-5")
	t.Setenv("DECEPTICON_DESKTOP_API_KEY", "")
	t.Setenv("DECEPTICON_DESKTOP_AUTH_FILE", profile)
	selected, err := parseDesktopRuntime(true)
	if err != nil || selected.authFile != profile {
		t.Fatalf("selected account: %v", err)
	}
	t.Setenv("CODEX_AUTH_VOLUME", "unselected")
	t.Setenv("CLAUDE_CREDENTIALS_VOLUME", "unrelated")
	applyDesktopAccountFile(selected)
	if os.Getenv("CODEX_AUTH_VOLUME") != profile || os.Getenv("CLAUDE_CREDENTIALS_VOLUME") != nullDevice() {
		t.Fatal("account source was mixed with an unrelated profile")
	}
	t.Setenv("DECEPTICON_DESKTOP_AUTH_FILE", "relative.json")
	if _, err := parseDesktopRuntime(true); err == nil {
		t.Fatal("relative account path admitted")
	}
	t.Setenv("DECEPTICON_DESKTOP_AUTH_FILE", filepath.Dir(profile))
	if _, err := parseDesktopRuntime(true); err == nil {
		t.Fatal("account directory admitted")
	}
	t.Setenv("DECEPTICON_DESKTOP_AUTH_FILE", profile)
	t.Setenv("DECEPTICON_DESKTOP_PROVIDER", "ollama")
	t.Setenv("DECEPTICON_DESKTOP_MODEL", "ollama_chat/qa")
	if _, err := parseDesktopRuntime(true); err == nil {
		t.Fatal("subscription profile admitted for Ollama")
	}
}

func TestDesktopProviderCredentialsMatchRouter(t *testing.T) {
	for _, tc := range []struct{ provider, model, keyEnv string }{
		{"kimi_code", "kimi_code/kimi-k2", "KIMI_API_KEY"},
		{"minimax_plan", "minimax_plan/MiniMax-M2", "MINIMAX_API_KEY"},
	} {
		t.Run(tc.provider, func(t *testing.T) {
			t.Setenv("DECEPTICON_DESKTOP_PROVIDER", tc.provider)
			t.Setenv("DECEPTICON_DESKTOP_MODEL", tc.model)
			t.Setenv("DECEPTICON_DESKTOP_API_KEY", "test-key-with-enough-characters")
			selected, err := parseDesktopRuntime(true)
			if err != nil {
				t.Fatal(err)
			}
			if selected.keyEnv != tc.keyEnv {
				t.Fatalf("credential env = %q, want %q", selected.keyEnv, tc.keyEnv)
			}
		})
	}
}

func TestDesktopRuntimeRejectsProviderOrModelMismatch(t *testing.T) {
	t.Setenv("DECEPTICON_DESKTOP_PROVIDER", "openai")
	t.Setenv("DECEPTICON_DESKTOP_MODEL", "anthropic/claude-sonnet-4")
	t.Setenv("DECEPTICON_DESKTOP_API_KEY", "test-key-with-enough-characters")
	if _, err := parseDesktopRuntime(true); err == nil {
		t.Fatal("expected provider/model mismatch to fail")
	}
	t.Setenv("DECEPTICON_DESKTOP_PROVIDER", "unknown-provider")
	t.Setenv("DECEPTICON_DESKTOP_MODEL", "unknown-provider/some-model")
	if _, err := parseDesktopRuntime(true); err == nil || !strings.Contains(err.Error(), "not yet supported") {
		t.Fatalf("expected missing OSS provider route: %v", err)
	}
}

func TestDesktopRuntimeOverlayReferencesProcessCredential(t *testing.T) {
	t.Setenv("DECEPTICON_DESKTOP_PROVIDER", "vercel")
	t.Setenv("DECEPTICON_DESKTOP_MODEL", "vercel/anthropic/claude-sonnet-4")
	t.Setenv("DECEPTICON_DESKTOP_API_KEY", "test-key-with-enough-characters")
	selected, err := parseDesktopRuntime(true)
	if err != nil {
		t.Fatal(err)
	}
	path, err := writeDesktopRuntimeOverlay(t.TempDir(), selected)
	if err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	content := string(data)
	if strings.Contains(content, os.Getenv("DECEPTICON_DESKTOP_API_KEY")) || !strings.Contains(content, "VERCEL_AI_GATEWAY_API_KEY: ${DECEPTICON_DESKTOP_API_KEY:") {
		t.Fatalf("overlay must refer to process credential without writing it")
	}
	if strings.Count(content, "DECEPTICON_MODEL:") != 2 {
		t.Fatalf("both services must receive selected model")
	}
}

func TestDesktopOllamaRuntimeNeedsNoKey(t *testing.T) {
	t.Setenv("DECEPTICON_DESKTOP_PROVIDER", "ollama")
	t.Setenv("DECEPTICON_DESKTOP_MODEL", "ollama_chat/qwen3:8b")
	t.Setenv("DECEPTICON_DESKTOP_API_KEY", "")
	selected, err := parseDesktopRuntime(true)
	if err != nil {
		t.Fatal(err)
	}
	path, err := writeDesktopRuntimeOverlay(t.TempDir(), selected)
	if err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(data), "OLLAMA_API_BASE: http://host.docker.internal:11434") || strings.Count(string(data), "OLLAMA_MODEL: qwen3:8b") != 2 || strings.Count(string(data), "DECEPTICON_LLM__TIMEOUT: '600'") != 1 || strings.Contains(string(data), "DECEPTICON_DESKTOP_API_KEY") {
		t.Fatal("Ollama overlay must use the host API without a secret")
	}
}

func TestDesktopSubscriptionRuntimeRoutesWithoutCopiedCredential(t *testing.T) {
	for _, tc := range []struct {
		provider string
		model    string
		flag     string
	}{
		{"chatgpt", "auth/gpt-5.6-sol", "DECEPTICON_AUTH_CHATGPT: 'true'"},
		{"claude_code", "auth/claude-sonnet-5-5", "DECEPTICON_AUTH_CLAUDE_CODE: 'true'"},
	} {
		t.Run(tc.provider, func(t *testing.T) {
			t.Setenv("DECEPTICON_DESKTOP_PROVIDER", tc.provider)
			t.Setenv("DECEPTICON_DESKTOP_MODEL", tc.model)
			t.Setenv("DECEPTICON_DESKTOP_API_KEY", "")
			selected, err := parseDesktopRuntime(true)
			if err != nil {
				t.Fatal(err)
			}
			path, err := writeDesktopRuntimeOverlay(t.TempDir(), selected)
			if err != nil {
				t.Fatal(err)
			}
			data, err := os.ReadFile(path)
			if err != nil {
				t.Fatal(err)
			}
			content := string(data)
			if strings.Count(content, tc.flag) != 2 || strings.Contains(content, "DECEPTICON_DESKTOP_API_KEY") {
				t.Fatalf("subscription overlay must use the existing CLI credential mount: %s", content)
			}
			t.Setenv("DECEPTICON_DESKTOP_API_KEY", "unexpected-secret")
			if _, err := parseDesktopRuntime(true); err == nil {
				t.Fatal("subscription must reject copied credentials")
			}
		})
	}
}

func TestDesktopGoogleCredentialCoversStaticAndDynamicRoutes(t *testing.T) {
	t.Setenv("DECEPTICON_DESKTOP_PROVIDER", "google")
	t.Setenv("DECEPTICON_DESKTOP_MODEL", "gemini/gemini-3.8-flash")
	t.Setenv("DECEPTICON_DESKTOP_API_KEY", "test-key-with-enough-characters")
	selected, err := parseDesktopRuntime(true)
	if err != nil {
		t.Fatal(err)
	}
	path, err := writeDesktopRuntimeOverlay(t.TempDir(), selected)
	if err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{"GOOGLE_API_KEY:", "GEMINI_API_KEY:"} {
		if strings.Count(string(data), key) != 2 {
			t.Fatalf("%s must reach both model containers", key)
		}
	}
}

func TestDesktopBootstrapCreatesPrivateServiceEnvWithoutModelKey(t *testing.T) {
	home := t.TempDir()
	t.Setenv("DECEPTICON_HOME", home)
	t.Setenv("DECEPTICON_DESKTOP_API_KEY", "test-key-with-enough-characters")
	if err := bootstrapDesktopEnv(); err != nil {
		t.Fatal(err)
	}
	path := home + string(os.PathSeparator) + ".env"
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	// Windows os.FileMode does not represent the file's NTFS ACL. The
	// config writer protects the file in the current user's home there.
	if runtime.GOOS != "windows" && info.Mode().Perm() != 0o600 {
		t.Fatalf("service config mode = %o, want 600", info.Mode().Perm())
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(data), os.Getenv("DECEPTICON_DESKTOP_API_KEY")) {
		t.Fatal("Desktop model key must not be persisted in the OSS env")
	}
	for _, value := range []string{"DECEPTICON_TELEMETRY=off", "LANGSMITH_TRACING=false", "LITELLM_MASTER_KEY=sk-", "POSTGRES_PASSWORD="} {
		if !strings.Contains(string(data), value) {
			t.Fatalf("missing %s in service config", value)
		}
	}
	if err := os.WriteFile(path, []byte("USER_SETTING=keep\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := bootstrapDesktopEnv(); err != nil {
		t.Fatal(err)
	}
	data, err = os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != "USER_SETTING=keep\n" {
		t.Fatal("Desktop bootstrap overwrote existing CLI configuration")
	}
}
