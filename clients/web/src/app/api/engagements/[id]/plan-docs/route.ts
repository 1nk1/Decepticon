import { machineScopeTargets } from "@decepticon/streaming";
import { requireAuth, AuthError } from "@/lib/auth-bridge";
import { prisma } from "@/lib/prisma";
import { resolveEngagementDir } from "@/lib/workspace";
import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs/promises";
import * as path from "path";

const WORKSPACE = process.env.WORKSPACE_PATH ?? path.join(process.env.HOME ?? "", ".decepticon", "workspace");

const PLAN_DOCS = ["opplan", "roe", "threat-profile", "conops", "deconfliction",
  "contact", "data-handling", "abort", "cleanup"] as const;

// scopeReady reports whether the engagement carries an enforced machine scope.
// Creating the engagement with a declared target is the authorization; the RoE
// middleware enforces the scope on every tool call, so there is no separate
// approval marker or plan-bundle approval step.
async function scopeReady(root: string): Promise<boolean> {
  try {
    const roe = JSON.parse(await fs.readFile(path.join(root, "plan", "roe.json"), "utf-8"));
    return machineScopeTargets(roe).length > 0;
  } catch {
    return false;
  }
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

  const docs: Record<string, unknown> = { scopeReady: false };

  let engagementDir: string;
  let planDir: string;
  try {
    engagementDir = resolveEngagementDir(engagement.name, WORKSPACE);
    planDir = path.join(engagementDir, "plan");
  } catch {
    return NextResponse.json(docs);
  }

  for (const name of PLAN_DOCS) {
    try {
      const content = await fs.readFile(path.join(planDir, `${name}.json`), "utf-8");
      docs[name] = JSON.parse(content);
    } catch {
      // File doesn't exist yet
    }
  }

  docs.scopeReady = await scopeReady(engagementDir);

  return NextResponse.json(docs);
}