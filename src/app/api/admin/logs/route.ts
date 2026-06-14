import { NextResponse } from "next/server";

import { requireAdminApiSession } from "@/server/auth/session";
import { getPrisma } from "@/server/db";
import { withApiTrace } from "@/server/observability/api-wrapper";

export const dynamic = "force-dynamic";

export const GET = withApiTrace({ subsystem: "admin", operation: "admin.logs.list" }, async function GET(request: Request) {
  const auth = await requireAdminApiSession();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const limit = clamp(Number(url.searchParams.get("limit") ?? 100), 1, 200);
  const cursor = url.searchParams.get("cursor");
  const traceId = clean(url.searchParams.get("traceId"));
  const severity = clean(url.searchParams.get("severity"));
  const operation = clean(url.searchParams.get("operation"));
  const projectId = clean(url.searchParams.get("projectId"));
  const userId = clean(url.searchParams.get("userId"));
  const status = clean(url.searchParams.get("status"));
  const from = parseDate(url.searchParams.get("from"));
  const to = parseDate(url.searchParams.get("to"));
  const prisma = getPrisma();
  const cursorEvent = cursor
    ? await prisma.traceEvent.findUnique({ where: { id: cursor }, select: { createdAt: true } })
    : null;

  const events = await prisma.traceEvent.findMany({
    where: {
      ...(traceId ? { traceId } : {}),
      ...(severity ? { severity } : {}),
      ...(operation ? { operation } : {}),
      ...(projectId ? { projectId } : {}),
      ...(userId ? { userId } : {}),
      ...(status ? { status } : {}),
      createdAt: {
        ...(from ? { gte: from } : {}),
        ...(to ? { lte: to } : {}),
        ...(cursorEvent ? { lt: cursorEvent.createdAt } : {}),
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
  });
  const page = events.slice(0, limit);
  const nextCursor = events.length > limit ? page.at(-1)?.id : null;

  return NextResponse.json({ events: page, nextCursor });
});

function clean(value: string | null) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function parseDate(value: string | null) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

