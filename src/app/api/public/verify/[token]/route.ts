import { NextResponse } from "next/server";
import { getPublicVerification } from "@/server/evidence/evidence-service";
import { enforceRateLimit, requestClientIdentity } from "@/server/security/rate-limit";

type Context = { params: Promise<{ token: string }> };
export async function GET(request: Request, { params }: Context) {
  const identity = requestClientIdentity(request) ?? "untrusted-proxy";
  const limit = await enforceRateLimit({ namespace: "public-report-verify", identity, limit: 60, windowMs: 60_000 });
  if (!limit.allowed) return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } });
  const { token } = await params;
  const result = await getPublicVerification(token);
  return result ? NextResponse.json(result, { headers: { "cache-control": "private, no-store", "x-robots-tag": "noindex, nofollow" } }) : NextResponse.json({ error: "Verification not found." }, { status: 404, headers: { "x-robots-tag": "noindex, nofollow" } });
}
