package engagement

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// withTestSources points the discovery sources at httptest servers for the
// duration of the test.
func withTestSources(t *testing.T, ctHandler, dnsHandler http.HandlerFunc) {
	t.Helper()
	ct := httptest.NewServer(ctHandler)
	t.Cleanup(ct.Close)
	dns := httptest.NewServer(dnsHandler)
	t.Cleanup(dns.Close)
	previous := discoverySources
	discoverySources = discoveryConfig{
		CTBaseURL:  ct.URL + "/",
		DNSBaseURL: dns.URL + "/",
		HTTPClient: &http.Client{Timeout: 5 * time.Second},
	}
	t.Cleanup(func() { discoverySources = previous })
}

func TestDiscoverScopeFiltersToTargetZone(t *testing.T) {
	withTestSources(t,
		func(w http.ResponseWriter, _ *http.Request) {
			// crt.sh packs several SANs per certificate, newline-separated.
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`[
				{"name_value": "app.decepticon.red\nwww.decepticon.red"},
				{"name_value": "*.staging.decepticon.red"},
				{"name_value": "notdecepticon.red"},
				{"name_value": "decepticon.red.evil.com"},
				{"name_value": "unrelated.example.org"}
			]`))
		},
		func(w http.ResponseWriter, _ *http.Request) {
			// HackerTarget replies with `host,ip` CSV.
			_, _ = w.Write([]byte("api.decepticon.red,203.0.113.10\nvpn.decepticon.red,203.0.113.11\n"))
		},
	)

	discovery := DiscoverScope("decepticon.red", 5*time.Second)

	want := []string{"app.decepticon.red", "www.decepticon.red", "*.staging.decepticon.red", "api.decepticon.red", "vpn.decepticon.red", "*.decepticon.red"}
	if got := strings.Join(discovery.Recommended, "|"); got != strings.Join(want, "|") {
		t.Fatalf("recommendations = %q, want %q", got, strings.Join(want, "|"))
	}
	if len(discovery.Notes) != 0 {
		t.Fatalf("unexpected source notes: %v", discovery.Notes)
	}
	// Every recommendation must survive the shared normalization pipeline.
	if _, dropped, err := dedupeScopeTargets(discovery.Recommended); err != nil || len(dropped) != 0 {
		t.Fatalf("recommendations failed normalization: dropped=%v err=%v", dropped, err)
	}
}

func TestDiscoverScopeSoftFailsPerSource(t *testing.T) {
	withTestSources(t,
		func(w http.ResponseWriter, _ *http.Request) {
			// CT source is down (non-200).
			w.WriteHeader(http.StatusServiceUnavailable)
		},
		func(w http.ResponseWriter, _ *http.Request) {
			// Free-tier passive DNS reports exhaustion as plain text.
			_, _ = w.Write([]byte("API count exceeded"))
		},
	)

	discovery := DiscoverScope("decepticon.red", 5*time.Second)

	// Both sources failed: only the mechanical *.apex suggestion remains
	// (it needs no network), plus the per-source fallback notes.
	want := []string{"*.decepticon.red"}
	if got := strings.Join(discovery.Recommended, "|"); got != strings.Join(want, "|") {
		t.Fatalf("recommendations = %q, want %q", got, strings.Join(want, "|"))
	}
	if len(discovery.Notes) != 2 {
		t.Fatalf("expected one note per failed source, got %v", discovery.Notes)
	}
	if !strings.Contains(discovery.Notes[0], "CT logs unavailable") || !strings.Contains(discovery.Notes[1], "passive DNS unavailable") {
		t.Fatalf("notes do not name the failed sources: %v", discovery.Notes)
	}
}

func TestDiscoverScopeKeepsPartialResultsWhenOneSourceFails(t *testing.T) {
	withTestSources(t,
		func(w http.ResponseWriter, _ *http.Request) {
			_, _ = w.Write([]byte(`[{"name_value": "ct.decepticon.red"}]`))
		},
		func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusTooManyRequests)
		},
	)

	discovery := DiscoverScope("decepticon.red", 5*time.Second)

	// CT results survive the DNS source's rate limit; the mechanical
	// *.apex glob is always offered for an apex target.
	want := []string{"ct.decepticon.red", "*.decepticon.red"}
	if got := strings.Join(discovery.Recommended, "|"); got != strings.Join(want, "|") {
		t.Fatalf("recommendations = %q, want %q", got, strings.Join(want, "|"))
	}
	if len(discovery.Notes) != 1 {
		t.Fatalf("expected a single rate-limit note, got %v", discovery.Notes)
	}
}

func TestDiscoverScopeRespectsTimeout(t *testing.T) {
	withTestSources(t,
		func(w http.ResponseWriter, _ *http.Request) {
			time.Sleep(3 * time.Second) // exceeds the discovery budget below
			_, _ = w.Write([]byte(`[{"name_value": "late.decepticon.red"}]`))
		},
		func(w http.ResponseWriter, _ *http.Request) {
			time.Sleep(3 * time.Second)
			_, _ = w.Write([]byte("late.decepticon.red,203.0.113.9\n"))
		},
	)

	discovery := DiscoverScope("decepticon.red", 500*time.Millisecond)

	want := []string{"*.decepticon.red"}
	if got := strings.Join(discovery.Recommended, "|"); got != strings.Join(want, "|") {
		t.Fatalf("timed-out sources must not contribute hosts, got %q", got)
	}
	if len(discovery.Notes) != 2 {
		t.Fatalf("expected timeout notes for both sources, got %v", discovery.Notes)
	}
}

func TestInZoneAnchorsOnLabelBoundary(t *testing.T) {
	cases := []struct {
		host  string
		zone  string
		match bool
	}{
		{"decepticon.red", "decepticon.red", true},
		{"app.decepticon.red", "decepticon.red", true},
		{"notdecepticon.red", "decepticon.red", false},
		{"decepticon.red.evil.com", "decepticon.red", false},
		{"DECEPTICON.RED.", "decepticon.red", true},
	}
	for _, tc := range cases {
		if got := inZone(tc.host, tc.zone); got != tc.match {
			t.Errorf("inZone(%q, %q) = %v, want %v", tc.host, tc.zone, got, tc.match)
		}
	}
}

func TestDiscoverScopeEmptyZoneIsNoop(t *testing.T) {
	discovery := discoverScope(context.Background(), "", time.Second, discoverySources)
	if len(discovery.Recommended) != 0 || len(discovery.Notes) != 0 {
		t.Fatalf("empty zone must be a noop, got %+v", discovery)
	}
}

func TestDiscoveryZonePicksFirstPlainHostname(t *testing.T) {
	// Contract: targets arrive normalized (dedupeScopeTargets output) —
	// URL/CIDR/glob reduction has already happened upstream.
	cases := []struct {
		targets []string
		zone    string
	}{
		{[]string{"decepticon.red"}, "decepticon.red"},
		{[]string{"10.0.0.0/24", "app.decepticon.red"}, "app.decepticon.red"},
		{[]string{"*.decepticon.red", "vpn.decepticon.red"}, "vpn.decepticon.red"},
		{[]string{"app.decepticon.red", "10.0.0.5"}, "app.decepticon.red"},
		{[]string{"10.0.0.0/24", "203.0.113.7"}, ""}, // no hostname → no discovery
		{[]string{"*.decepticon.red"}, ""},           // glob already covers the zone
	}
	for _, tc := range cases {
		if got := discoveryZone(tc.targets); got != tc.zone {
			t.Errorf("discoveryZone(%v) = %q, want %q", tc.targets, got, tc.zone)
		}
	}
}
