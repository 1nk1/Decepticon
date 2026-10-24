import { test } from "node:test";
import assert from "node:assert/strict";
import { directRoe, validateDirectTarget } from "./direct-scope";

test("direct Red scope generates the machine-enforceable RoE alone", () => {
  const roe = directRoe("test-engagement", "web_url", "https://example.com");
  assert.deepEqual(roe, {
    engagement_name: "test-engagement",
    machine_enforcement: { in_scope: ["https://example.com"], out_of_scope: [] },
  });
});

test("direct Red scope rejects unsupported target shapes", () => {
  for (const [type, target] of [
    ["web_url", "https://example.com/admin"],
    ["web_url", "https://example.com:8443"],
    ["web_url", "https://user:pass@example.com"],
    ["web_url", "file:///etc/passwd"],
    ["ip_range", "10.0.0.1-10.0.0.255"],
    ["ip_range", "10.0.0.0/33"],
  ]) {
    assert.throws(() => validateDirectTarget(type, target));
  }
});

test("client readiness follows unconditional machine enforcement", async () => {
  const { machineScopeTargets } = await import("@decepticon/streaming");
  for (const mode of [undefined, "enforce", "audit", "warn"]) {
    assert.deepEqual(machineScopeTargets({ machine_enforcement: { mode, in_scope: [null, "example.com", { target: "legacy.example.com" }] } }), ["example.com", "legacy.example.com"]);
  }
  assert.deepEqual(machineScopeTargets(directRoe("test", "web_url", "https://example.com")), ["https://example.com"]);
  for (const roe of [null, {}, { in_scope: ["example.com"] }, { machine_enforcement: { in_scope: "example.com" } }, { machine_enforcement: { in_scope: [null, {}, "", "  ", 12] } }]) {
    assert.deepEqual(machineScopeTargets(roe), []);
  }
});
