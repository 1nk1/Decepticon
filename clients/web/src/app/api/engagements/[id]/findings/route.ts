import { requireAuth, AuthError } from "@/lib/auth-bridge";
import { prisma } from "@/lib/prisma";
import { resolveEngagementDir } from "@/lib/workspace";
import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs/promises";
import * as path from "path";
import * as yaml from "js-yaml";

interface Finding {
  id: string;
  title: string;
  severity: string;
  description: string;
  evidence: string;
  attackVector: string;
  affectedAssets: string[];
  cvssScore?: number;
  cvssVector?: string;
  cwe?: string[];
  mitre?: string[];
  remediation?: string;
  resultKind?: string;
  verificationStatus?: string;
  verificationRationale?: string;
  reportStatus?: string;
}

// Flat-scalar frontmatter, matching the finding-protocol template's
// `key: value` lines. Nested YAML (e.g. evidence_manifest) isn't needed by
// this projection, so any list/map value is dropped rather than parsed.
// A real YAML parser (not a hand-rolled line regex) is required even for
// scalars: free-text fields like `verification_rationale` legitimately use
// block literal/folded scalars (`|`, `>`) and quoted escapes, both of which
// a `^key:\s*(.*)$` regex silently mishandles — it captures an empty value
// for a block scalar's header line (dropping the field) and leaves quote/
// backslash escapes in double- or single-quoted values un-decoded.
function parseFrontmatter(content: string): { metadata: Record<string, string>; body: string } {
  const lines = content.split("\n");
  if (lines[0]?.trim() !== "---") {
    return { metadata: {}, body: content };
  }
  const end = lines.findIndex((line, i) => i > 0 && /^---[ \t\r]*$/.test(line));
  if (end === -1) {
    return { metadata: {}, body: content };
  }
  const metadata: Record<string, string> = {};
  try {
    const parsed: unknown = yaml.load(lines.slice(1, end).join("\n"));
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        // Type validation: only flat scalars are projected here. A list/map/
        // date value means the document needs real structured parsing
        // (evidence_manifest etc.), which is check_finding_report's job, not
        // this read-only projection's.
        if (typeof value === "string") {
          if (value) metadata[key] = value;
        } else if (typeof value === "number" || typeof value === "boolean") {
          metadata[key] = String(value);
        }
      }
    }
  } catch {
    // Malformed YAML: fall back to no metadata rather than failing the
    // whole findings listing over one bad file.
  }
  return { metadata, body: lines.slice(end + 1).join("\n") };
}

function parseFindingMarkdown(content: string, filename: string): Finding {
  const { metadata, body } = parseFrontmatter(content);
  const lines = body.split("\n");
  let title = metadata.title ?? filename;
  let severity = metadata.severity;
  let description = "";
  let evidence = "";
  let attackVector = "";
  const affectedAssets: string[] = [];
  let cvssScore: number | undefined;
  let cvssVector: string | undefined;
  const cwe: string[] = [];
  const mitre: string[] = [];
  let remediation = "";

  let currentSection = "";

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("# ")) {
      if (!metadata.title) title = trimmed.slice(2).trim();
      continue;
    }

    if (trimmed.startsWith("## ")) {
      currentSection = trimmed.slice(3).trim().toLowerCase();
      continue;
    }

    if (!metadata.severity) {
      const severityMatch = trimmed.toLowerCase();
      if (severityMatch.includes("severity") && trimmed.includes(":")) {
        const val = trimmed.split(":")[1]?.trim().replace(/\*/g, "").toLowerCase();
        if (["critical", "high", "medium", "low", "informational"].includes(val)) {
          severity = val;
        }
      }
    }
    if (trimmed.toLowerCase().startsWith("cvss score") && trimmed.includes(":")) {
      const val = trimmed.split(":")[1]?.trim();
      if (val) cvssScore = parseFloat(val) || undefined;
    }
    if (trimmed.toLowerCase().startsWith("cvss vector") && trimmed.includes(":")) {
      cvssVector = trimmed.split(":").slice(1).join(":").trim() || undefined;
    }

    if ((currentSection === "summary" || currentSection === "description") && trimmed) {
      description += (description ? "\n" : "") + trimmed;
    }
    if (currentSection === "evidence" && trimmed) {
      evidence += (evidence ? "\n" : "") + trimmed;
    }
    if (
      (currentSection === "attack vector" ||
        currentSection === "attack-vector") &&
      trimmed
    ) {
      attackVector += (attackVector ? "\n" : "") + trimmed;
    }
    if (
      (currentSection === "affected" ||
        currentSection === "affected assets" ||
        currentSection === "assets") &&
      trimmed
    ) {
      if (trimmed.startsWith("-") || trimmed.startsWith("*")) {
        affectedAssets.push(trimmed.replace(/^[-*]\s*/, ""));
      }
    }
    if (currentSection === "remediation" && trimmed) {
      remediation += (remediation ? "\n" : "") + trimmed;
    }
    if ((currentSection === "cwe" || currentSection === "weaknesses") && trimmed) {
      const cweMatch = trimmed.match(/CWE-\d+/g);
      if (cweMatch) cwe.push(...cweMatch);
    }
    if ((currentSection === "mitre" || currentSection === "mitre att&ck" || currentSection === "techniques") && trimmed) {
      const mitreMatch = trimmed.match(/T\d{4}(\.\d+)?/g);
      if (mitreMatch) mitre.push(...mitreMatch);
    }
  }

  return {
    id: filename.replace(".md", ""),
    title,
    severity: severity || "unspecified",
    description: description || "No description available.",
    evidence: evidence || "No evidence recorded.",
    attackVector: attackVector || "Unknown",
    affectedAssets,
    ...(cvssScore != null && { cvssScore }),
    ...(cvssVector && { cvssVector }),
    ...(cwe.length > 0 && { cwe }),
    ...(mitre.length > 0 && { mitre }),
    ...(remediation && { remediation }),
    ...(metadata.result_kind && { resultKind: metadata.result_kind }),
    ...(metadata.verification_status && { verificationStatus: metadata.verification_status }),
    ...(metadata.verification_rationale && { verificationRationale: metadata.verification_rationale }),
    ...(metadata.report_status && { reportStatus: metadata.report_status }),
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let userId: string;
  try {
    ({ userId } = await requireAuth());
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    throw e;
  }

  const { id } = await params;
  const engagement = await prisma.engagement.findFirst({
    where: { id, userId },
  });

  if (!engagement) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const findings: Finding[] = [];

  {
    const WORKSPACE = process.env.WORKSPACE_PATH ?? path.join(process.env.HOME ?? "", ".decepticon", "workspace");
    try {
      const wsPath = resolveEngagementDir(engagement.name, WORKSPACE);
      const findingsDir = path.join(wsPath, "findings");
      const files = await fs.readdir(findingsDir);
      for (const file of files.sort()) {
        if (file.startsWith("FIND-") && file.endsWith(".md")) {
          const content = await fs.readFile(
            path.join(findingsDir, file),
            "utf-8"
          );
          findings.push(parseFindingMarkdown(content, file));
        }
      }
    } catch {
      // Directory doesn't exist yet
    }
  }

  return NextResponse.json(findings);
}
