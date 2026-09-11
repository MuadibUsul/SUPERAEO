import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";

import { requireApiSession } from "@/server/auth/session";
import { getProject } from "@/server/data/projects";
import { getPrisma } from "@/server/db";
import { withApiTrace } from "@/server/observability/api-wrapper";

type Context = { params: Promise<{ projectId: string }> };

export const GET = withApiTrace<Context>({ subsystem: "evidence", operation: "evidence.list" }, async function GET(request, { params }) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;
  const { projectId } = await params;
  const project = await getProject(projectId, auth.session);
  if (project.status !== "ready" || !project.data) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize")) || 25));
  const runId = url.searchParams.get("runId") || undefined;
  const model = url.searchParams.get("model") || undefined;
  const sourceStatus = enumValue(url.searchParams.get("sourceStatus"), ["PENDING", "VERIFIED_REACHABLE", "SNAPSHOT_CREATED", "UNREACHABLE", "LOGIN_REQUIRED", "BLOCKED_BY_ROBOTS", "UNSAFE_URL", "FETCH_FAILED", "CONTENT_CHANGED"] as const);
  const from = validDate(url.searchParams.get("from"));
  const to = validDate(url.searchParams.get("to"), true);
  const claimType = enumValue(url.searchParams.get("claimType"), ["OBSERVATION", "INFERENCE", "EXTERNAL_FACT", "EXPERIMENT"] as const);
  const evidenceGrade = enumValue(url.searchParams.get("evidenceGrade"), ["INSUFFICIENT", "DIRECTIONAL", "CORROBORATED", "CONFIRMATORY"] as const);
  const linkFilters: Prisma.EvidenceLinkWhereInput[] = [];
  if (model) linkFilters.push({ response: { model } });
  if (sourceStatus) linkFilters.push({ sourceSnapshot: { verificationStatus: sourceStatus } });
  const where: Prisma.EvidenceClaimWhereInput = {
    projectId,
    ...(runId ? { runId } : {}),
    ...(claimType ? { claimType } : {}),
    ...(evidenceGrade ? { evidenceGrade } : {}),
    ...((from || to) ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    ...(linkFilters.length ? { AND: linkFilters.map((filter) => ({ links: { some: filter } })) } : {}),
  };
  const prisma = getPrisma();
  const [claims, total] = await Promise.all([
    prisma.evidenceClaim.findMany({ where, include: { links: { include: { response: { select: { id: true, model: true, createdAt: true } }, sourceSnapshot: true } } }, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.evidenceClaim.count({ where }),
  ]);
  if (url.searchParams.get("format") === "csv") {
    const rows = [["id", "type", "status", "grade", "statement", "supporting", "opposing", "methodVersion"], ...claims.map((claim) => [claim.id, claim.claimType, claim.supportStatus, claim.evidenceGrade, claim.statement, claim.supportingCount, claim.opposingCount, claim.methodVersion])];
    return new Response(rows.map((row) => row.map(csv).join(",")).join("\n"), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="evidence-${projectId}.csv"` } });
  }
  return NextResponse.json({ claims, pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) } }, { headers: { "cache-control": "private, no-store" } });
});

function enumValue<T extends string>(value: string | null, values: readonly T[]) { return value && values.includes(value as T) ? value as T : undefined; }
function csv(value: unknown) { return `"${String(value ?? "").replaceAll('"', '""')}"`; }
function validDate(value: string | null, endOfDay = false) {
  if (!value) return undefined;
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}
