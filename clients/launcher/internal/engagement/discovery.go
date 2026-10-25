package engagement

// Passive scope discovery for engagement creation: certificate-transparency
// logs (crt.sh) and passive DNS (HackerTarget) suggest in-scope entries for
// a hostname target. Every recommendation passes through the same
// normalization + dead-pattern pipeline as manual input (scope_targets.go),
// and is filtered to the target's own zone — a CT SAN or passive-DNS record
// for an unrelated domain (or a lookalike like `notdecepticon.red`) never
// becomes an in-scope suggestion.
//
// Sources fail soft: a timeout, rate limit, or malformed reply only drops
// that source's contribution and appends a note. The caller falls back to
// manual entry when nothing comes back.

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"strings"
	"time"
)

// discoverySources points at the keyless public endpoints. Tests override
// them with httptest servers; nothing else in the launcher touches the
// network during creation.
var discoverySources = discoveryConfig{
	CTBaseURL:  "https://crt.sh/",
	DNSBaseURL: "https://api.hackertarget.com/hostsearch/",
	HTTPClient: &http.Client{Timeout: 8 * time.Second},
}

// scopeDiscoveryBudget caps the whole discovery step: both sources run
// concurrently inside this window, and whatever answered in time is what
// the operator gets — creation never waits on the network beyond it.
const scopeDiscoveryBudget = 12 * time.Second

// discoveryZone picks the queryable zone for passive discovery: the first
// normalized target that is a plain hostname (bare labels, IPs, CIDRs and
// globs have no meaningful CT/passive-DNS query).
func discoveryZone(targets []string) string {
	for _, target := range targets {
		if isPlainHostname(target) {
			return target
		}
	}
	return ""
}

func isPlainHostname(pattern string) bool {
	if strings.HasPrefix(pattern, "*.") || strings.ContainsAny(pattern, "*?") {
		return false
	}
	if net.ParseIP(pattern) != nil {
		return false
	}
	if _, err := netip.ParsePrefix(pattern); err == nil {
		return false
	}
	return strings.Contains(pattern, ".")
}

type discoveryConfig struct {
	CTBaseURL  string
	DNSBaseURL string
	HTTPClient *http.Client
}

// ScopeDiscovery carries the recommendations and the per-source notes.
type ScopeDiscovery struct {
	Recommended []string
	Notes       []string
}

// DiscoverScope suggests in-scope entries for a plain hostname target: the
// hosts CT logs and passive DNS place in the target's zone, plus a `*.zone`
// glob when the target is the zone apex itself. `zone` must already be
// normalized (lowercase, no trailing dot).
func DiscoverScope(zone string, timeout time.Duration) ScopeDiscovery {
	cfg := discoverySources
	return discoverScope(context.Background(), zone, timeout, cfg)
}

func discoverScope(ctx context.Context, zone string, timeout time.Duration, cfg discoveryConfig) ScopeDiscovery {
	discovery := ScopeDiscovery{}
	if zone == "" {
		return discovery
	}
	if deadline, ok := ctx.Deadline(); !ok || time.Until(deadline) > timeout {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, timeout)
		defer cancel()
	}

	// Give each source the full shared budget. A slow CT request must not
	// consume the time available to passive DNS. Buffered channels let a
	// cancelled caller return even if a transport takes time to unwind.
	type result struct {
		hosts []string
		err   error
	}
	ct, dns := make(chan result, 1), make(chan result, 1)
	go func(reply chan<- result) {
		hosts, err := fetchCTSubdomains(ctx, cfg, zone)
		reply <- result{hosts, err}
	}(ct)
	go func(reply chan<- result) { hosts, err := fetchPassiveDNS(ctx, cfg, zone); reply <- result{hosts, err} }(dns)
	var ctResult, dnsResult result
	for ct != nil || dns != nil {
		select {
		case ctResult = <-ct:
			ct = nil
		case dnsResult = <-dns:
			dns = nil
		case <-ctx.Done():
			// Prefer results already delivered at the deadline over timeout notes.
			if ct != nil {
				select {
				case ctResult = <-ct:
				default:
					ctResult.err = ctx.Err()
				}
				ct = nil
			}
			if dns != nil {
				select {
				case dnsResult = <-dns:
				default:
					dnsResult.err = ctx.Err()
				}
				dns = nil
			}
		}
	}
	if ctResult.err != nil {
		discovery.Notes = append(discovery.Notes, discoveryNote("CT logs", ctResult.err))
	}
	if dnsResult.err != nil {
		discovery.Notes = append(discovery.Notes, discoveryNote("passive DNS", dnsResult.err))
	}
	discovery.Recommended = recommendFromHosts(zone, append(append([]string{}, ctResult.hosts...), dnsResult.hosts...))
	return discovery
}

// inZone reports whether a host belongs to the target's own DNS zone.
// Suffix matching is anchored on a label boundary so a lookalike
// (`notdecepticon.red`, `decepticon.red.evil.com`) never matches.
func inZone(host, zone string) bool {
	host = strings.TrimSuffix(strings.ToLower(host), ".")
	if host == zone {
		return true
	}
	return strings.HasSuffix(host, "."+zone)
}

// zoneHost strips a leading wildcard label and reports whether the entry
// belongs to the zone (wildcard globs are kept as globs — they normalize
// through the shared pipeline like any other target).
func zoneHost(entry, zone string) (host string, ok bool) {
	entry = strings.ToLower(strings.TrimSuffix(entry, "."))
	if strings.HasPrefix(entry, "*.") {
		if !inZone(strings.TrimPrefix(entry, "*."), zone) {
			return "", false
		}
		return entry, true
	}
	if !inZone(entry, zone) {
		return "", false
	}
	return entry, true
}

// recommendFromHosts normalizes the discovered hosts, keeps only zone
// members, dedupes, and — for a plain apex target — suggests the `*.apex`
// glob. The operator's own target is deliberately absent: it is always part
// of the scope regardless, and the picker's suggestion list should only
// carry what discovery adds.
func recommendFromHosts(zone string, hosts []string) []string {
	raw := make([]string, 0, len(hosts)+1)
	for _, entry := range hosts {
		if host, ok := zoneHost(entry, zone); ok {
			raw = append(raw, host)
		}
	}
	recommended, _, dedupeErr := dedupeScopeTargets(raw)
	if dedupeErr != nil {
		// Normalization is deterministic for already-filtered hosts; a
		// failure here means a source returned something pathological —
		// drop the suggestions rather than poison the scope review.
		return []string{}
	}
	if recommended == nil {
		recommended = []string{}
	}
	// The operator typed the apex; the mechanical suggestion is the glob
	// that also covers the unnamed siblings (`*.zone` does not match the
	// bare domain, so both stay in the list).
	glob := "*." + zone
	if _, _, globErr := dedupeScopeTargets([]string{glob}); globErr == nil && !containsString(recommended, glob) {
		recommended = append(recommended, glob)
	}
	return recommended
}

// fetchCTSubdomains queries crt.sh for certificate SANs under zone. The
// JSON reply lists certificates whose `name_value` packs several names per
// certificate, newline-separated.
func fetchCTSubdomains(ctx context.Context, cfg discoveryConfig, zone string) ([]string, error) {
	q := url.Values{"q": {"%." + zone}, "output": {"json"}}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, cfg.CTBaseURL+"?"+q.Encode(), nil)
	if err != nil {
		return nil, err
	}
	resp, err := cfg.HTTPClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("crt.sh returned HTTP %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return nil, err
	}
	var certs []struct {
		NameValue string `json:"name_value"`
	}
	if err := json.Unmarshal(body, &certs); err != nil {
		return nil, fmt.Errorf("crt.sh reply is not JSON: %w", err)
	}
	var hosts []string
	for _, cert := range certs {
		for _, name := range strings.Split(cert.NameValue, "\n") {
			if name = strings.TrimSpace(name); name != "" {
				hosts = append(hosts, name)
			}
		}
	}
	return hosts, nil
}

// fetchPassiveDNS queries HackerTarget's host search. A success reply is
// `host,ip` CSV; the free tier answers errors as plain text, so any line
// without a comma in a comma-less body is reported as a source failure.
func fetchPassiveDNS(ctx context.Context, cfg discoveryConfig, zone string) ([]string, error) {
	q := url.Values{"q": {zone}}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, cfg.DNSBaseURL+"?"+q.Encode(), nil)
	if err != nil {
		return nil, err
	}
	resp, err := cfg.HTTPClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("hackertarget returned HTTP %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, err
	}
	var hosts []string
	for _, line := range strings.Split(string(body), "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		host, _, found := strings.Cut(line, ",")
		if !found {
			return nil, fmt.Errorf("hackertarget replied: %s", truncateNote(line, 80))
		}
		if host = strings.TrimSpace(host); host != "" {
			hosts = append(hosts, host)
		}
	}
	return hosts, nil
}

func truncateNote(text string, max int) string {
	if len(text) <= max {
		return text
	}
	return text[:max-1] + "…"
}

// Keep transport URLs and Go internals out of the creation flow. Source names
// and a useful reason explain partial results without implying setup failed.
func discoveryNote(source string, err error) string {
	var networkErr net.Error
	if errors.Is(err, context.DeadlineExceeded) || (errors.As(err, &networkErr) && networkErr.Timeout()) {
		return source + " unavailable (timed out)"
	}
	return source + " unavailable"
}
