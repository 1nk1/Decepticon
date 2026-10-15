import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { after, before, test } from "node:test";
import * as nodeModule from "node:module";
import { NextRequest } from "next/server";
import { pathToFileURL } from "node:url";

const testTempRoot = process.env.RED_TEAM_LABS_TEST_TMPDIR ?? process.cwd();

type TestEngagement = {
  id: string;
  name: string;
  userId: string;
  status: string;
  targetType: string;
  targetValue: string;
  createdAt: Date;
  updatedAt: Date;
};

declare global {
  var __engagementFindingsTestRows: TestEngagement[] | undefined;
}

const moduleTempRoot = join(testTempRoot, "engagement-findings-modules");
const authModule = pathToFileURL(join(moduleTempRoot, "auth.cjs")).href;
const prismaModule = pathToFileURL(join(moduleTempRoot, "prisma.cjs")).href;

const registerHooks = (nodeModule as unknown as {
  registerHooks: (hooks: {
    resolve: (
      specifier: string,
      context: unknown,
      nextResolve: (specifier: string, context: unknown) => unknown,
    ) => unknown;
  }) => void;
}).registerHooks;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/lib/auth-bridge") return { url: authModule, shortCircuit: true };
    if (specifier === "@/lib/prisma") return { url: prismaModule, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});

type FindingsGet = typeof import("./route").GET;
let findingsGet: FindingsGet;

before(async () => {
  await mkdir(moduleTempRoot, { recursive: true });
  await writeFile(join(moduleTempRoot, "auth.cjs"), `
    class AuthError extends Error {}
    async function requireAuth() { return { userId: "owner" }; }
    module.exports = { AuthError, requireAuth };
  `);
  await writeFile(join(moduleTempRoot, "prisma.cjs"), `
    module.exports = {
      prisma: {
        engagement: {
          findFirst: async ({ where }) => globalThis.__engagementFindingsTestRows?.find(
            (row) => row.id === where.id && row.userId === where.userId,
          ) ?? null,
        },
      },
    };
  `);
  findingsGet = (await import("./route")).GET;
});

after(async () => {
  await rm(moduleTempRoot, { recursive: true, force: true });
});

async function fetchFindings(directory: string, fileContent: string): Promise<Record<string, unknown>[]> {
  const engagement: TestEngagement = {
    id: "owned-engagement",
    name: "owned-fixture",
    userId: "owner",
    status: "draft",
    targetType: "web_url",
    targetValue: "https://fixture.invalid",
    createdAt: new Date("2026-10-01T00:00:00.000Z"),
    updatedAt: new Date("2026-10-01T00:00:00.000Z"),
  };
  globalThis.__engagementFindingsTestRows = [engagement];
  process.env.WORKSPACE_PATH = directory;
  const findingsDir = join(directory, engagement.name, "findings");
  await mkdir(findingsDir, { recursive: true });
  await writeFile(join(findingsDir, "FIND-901.md"), fileContent);
  const response = await findingsGet(
    new NextRequest("http://localhost/api/engagements/owned-engagement/findings"),
    { params: Promise.resolve({ id: engagement.id }) },
  );
  assert.equal(response.status, 200);
  return response.json() as Promise<Record<string, unknown>[]>;
}

test("findings projection preserves canonical title, summary and lifecycle metadata for an unverified observation", async () => {
  const directory = await mkdtemp(join(testTempRoot, "engagement-findings-"));
  const previousWorkspace = process.env.WORKSPACE_PATH;
  try {
    const fixture = `---
id: FIND-901
title: Synthetic filesystem observation
result_kind: observation
verification_status: unverified
verification_rationale: Synthetic tool fixture only; no real security finding.
report_status: draft
---

## Summary
Owned synthetic native filesystem fixture.

## Verification
No real vulnerability or target interaction.
`;
    const [finding] = await fetchFindings(directory, fixture);
    assert.equal(finding.title, "Synthetic filesystem observation");
    assert.equal(finding.severity, "unspecified");
    assert.equal(finding.description, "Owned synthetic native filesystem fixture.");
    assert.equal(finding.resultKind, "observation");
    assert.equal(finding.verificationStatus, "unverified");
    assert.equal(
      finding.verificationRationale,
      "Synthetic tool fixture only; no real security finding.",
    );
    assert.equal(finding.reportStatus, "draft");
  } finally {
    if (previousWorkspace === undefined) delete process.env.WORKSPACE_PATH;
    else process.env.WORKSPACE_PATH = previousWorkspace;
    globalThis.__engagementFindingsTestRows = undefined;
    await rm(directory, { recursive: true, force: true });
  }
});

test("findings projection decodes a literal block scalar verification_rationale", async () => {
  const directory = await mkdtemp(join(testTempRoot, "engagement-findings-"));
  const previousWorkspace = process.env.WORKSPACE_PATH;
  try {
    const fixture = `---
id: FIND-901
title: Literal block scalar rationale
result_kind: vulnerability
verification_status: verified
verification_rationale: |
  Confirmed via manual replay:
  - step one
  - step two
report_status: complete
---

## Summary
Fixture for literal block scalar frontmatter.

## Verification
Replayed manually.
`;
    const [finding] = await fetchFindings(directory, fixture);
    assert.equal(
      finding.verificationRationale,
      "Confirmed via manual replay:\n- step one\n- step two\n",
    );
    assert.equal(finding.reportStatus, "complete");
  } finally {
    if (previousWorkspace === undefined) delete process.env.WORKSPACE_PATH;
    else process.env.WORKSPACE_PATH = previousWorkspace;
    globalThis.__engagementFindingsTestRows = undefined;
    await rm(directory, { recursive: true, force: true });
  }
});

test("findings projection decodes a folded block scalar verification_rationale", async () => {
  const directory = await mkdtemp(join(testTempRoot, "engagement-findings-"));
  const previousWorkspace = process.env.WORKSPACE_PATH;
  try {
    const fixture = `---
id: FIND-901
title: Folded block scalar rationale
result_kind: observation
verification_status: unverified
verification_rationale: >
  This rationale wraps across
  several source lines but folds
  into one paragraph.
report_status: draft
---

## Summary
Fixture for folded block scalar frontmatter.

## Verification
No real target interaction.
`;
    const [finding] = await fetchFindings(directory, fixture);
    assert.equal(
      finding.verificationRationale,
      "This rationale wraps across several source lines but folds into one paragraph.\n",
    );
  } finally {
    if (previousWorkspace === undefined) delete process.env.WORKSPACE_PATH;
    else process.env.WORKSPACE_PATH = previousWorkspace;
    globalThis.__engagementFindingsTestRows = undefined;
    await rm(directory, { recursive: true, force: true });
  }
});

test("findings projection decodes escaped quotes in a double-quoted verification_rationale", async () => {
  const directory = await mkdtemp(join(testTempRoot, "engagement-findings-"));
  const previousWorkspace = process.env.WORKSPACE_PATH;
  try {
    const fixture = `---
id: FIND-901
title: Quoted escape rationale
result_kind: vulnerability
verification_status: verified
verification_rationale: "Confirmed via \\"curl\\" PoC; see note.\\nReplay recorded."
report_status: complete
---

## Summary
Fixture for a double-quoted rationale with escapes.

## Verification
Replayed via curl.
`;
    const [finding] = await fetchFindings(directory, fixture);
    assert.equal(
      finding.verificationRationale,
      'Confirmed via "curl" PoC; see note.\nReplay recorded.',
    );
  } finally {
    if (previousWorkspace === undefined) delete process.env.WORKSPACE_PATH;
    else process.env.WORKSPACE_PATH = previousWorkspace;
    globalThis.__engagementFindingsTestRows = undefined;
    await rm(directory, { recursive: true, force: true });
  }
});

test("findings projection decodes doubled single-quote escapes in verification_rationale", async () => {
  const directory = await mkdtemp(join(testTempRoot, "engagement-findings-"));
  const previousWorkspace = process.env.WORKSPACE_PATH;
  try {
    const fixture = `---
id: FIND-901
title: Single-quoted escape rationale
result_kind: vulnerability
verification_status: verified
verification_rationale: 'It''s confirmed: the endpoint leaks data.'
report_status: complete
---

## Summary
Fixture for a single-quoted rationale with a doubled-quote escape.

## Verification
Replayed manually.
`;
    const [finding] = await fetchFindings(directory, fixture);
    assert.equal(
      finding.verificationRationale,
      "It's confirmed: the endpoint leaks data.",
    );
  } finally {
    if (previousWorkspace === undefined) delete process.env.WORKSPACE_PATH;
    else process.env.WORKSPACE_PATH = previousWorkspace;
    globalThis.__engagementFindingsTestRows = undefined;
    await rm(directory, { recursive: true, force: true });
  }
});

test("findings projection ignores malformed frontmatter instead of throwing", async () => {
  const directory = await mkdtemp(join(testTempRoot, "engagement-findings-"));
  const previousWorkspace = process.env.WORKSPACE_PATH;
  try {
    const fixture = `---
title: "unterminated
---

## Summary
Fixture with invalid YAML frontmatter.

## Verification
N/A
`;
    const [finding] = await fetchFindings(directory, fixture);
    assert.equal(finding.title, "FIND-901.md");
    assert.equal(finding.resultKind, undefined);
  } finally {
    if (previousWorkspace === undefined) delete process.env.WORKSPACE_PATH;
    else process.env.WORKSPACE_PATH = previousWorkspace;
    globalThis.__engagementFindingsTestRows = undefined;
    await rm(directory, { recursive: true, force: true });
  }
});

test("findings projection keeps legacy heading-based records working without frontmatter", async () => {
  const directory = await mkdtemp(join(testTempRoot, "engagement-findings-"));
  const previousWorkspace = process.env.WORKSPACE_PATH;
  try {
    const fixture = `# Legacy SQL Injection

Severity: critical

## Description
Classic legacy record with no frontmatter at all.
`;
    const [finding] = await fetchFindings(directory, fixture);
    assert.equal(finding.title, "Legacy SQL Injection");
    assert.equal(finding.severity, "critical");
    assert.equal(finding.description, "Classic legacy record with no frontmatter at all.");
    assert.equal(finding.resultKind, undefined);
    assert.equal(finding.verificationStatus, undefined);
  } finally {
    if (previousWorkspace === undefined) delete process.env.WORKSPACE_PATH;
    else process.env.WORKSPACE_PATH = previousWorkspace;
    globalThis.__engagementFindingsTestRows = undefined;
    await rm(directory, { recursive: true, force: true });
  }
});
