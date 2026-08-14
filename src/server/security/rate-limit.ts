import crypto from "node:crypto";

import { connectedControlRedis } from "@/server/redis-control";

const FIXED_WINDOW_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
return {count, ttl}
`;

export type RateLimitResult =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterSeconds: number; unavailable?: boolean };

export async function enforceRateLimit(input: {
  namespace: string;
  identity: string;
  limit: number;
  windowMs: number;
}): Promise<RateLimitResult> {
  if (!process.env.REDIS_URL) {
    return process.env.NODE_ENV === "production"
      ? { allowed: false, retryAfterSeconds: 30, unavailable: true }
      : { allowed: true, remaining: input.limit };
  }

  const identityHash = crypto.createHash("sha256").update(input.identity).digest("hex");
  const key = `cip:rate-limit:${input.namespace}:${identityHash}`;

  try {
    const redis = await connectedControlRedis();
    const result = await redis.eval(FIXED_WINDOW_SCRIPT, 1, key, input.windowMs) as [number, number];
    const count = Number(result[0]);
    const ttlMs = Math.max(1000, Number(result[1]));

    if (count > input.limit) {
      return { allowed: false, retryAfterSeconds: Math.ceil(ttlMs / 1000) };
    }

    return { allowed: true, remaining: Math.max(0, input.limit - count) };
  } catch (error) {
    console.error("Rate limit check failed", error);
    return process.env.NODE_ENV === "production"
      ? { allowed: false, retryAfterSeconds: 30, unavailable: true }
      : { allowed: true, remaining: input.limit };
  }
}

/**
 * Forwarded-for style headers are trivially spoofed, so a limiter keyed on them
 * can be bypassed by varying the header per request. Only trust them when the
 * deployment sits behind a proxy that overwrites them, which the operator
 * asserts with TRUSTED_PROXY=true.
 *
 * Returns null when the client address cannot be trusted. Callers must then
 * skip their per-IP bucket rather than throttle everyone into one shared
 * bucket — the per-account bucket is what actually protects credentials.
 */
export function requestClientIdentity(request: Request): string | null {
  if (process.env.TRUSTED_PROXY !== "true") {
    return null;
  }

  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

/**
 * Applies a set of buckets and returns the first one that rejected, if any.
 * Entries with a null identity are skipped (see requestClientIdentity).
 */
export async function enforceRateLimits(
  buckets: Array<{ namespace: string; identity: string | null; limit: number; windowMs: number }>,
) {
  const applicable = buckets.filter(
    (bucket): bucket is { namespace: string; identity: string; limit: number; windowMs: number } =>
      bucket.identity !== null,
  );
  const results = await Promise.all(applicable.map(enforceRateLimit));
  return results.find((result): result is Extract<RateLimitResult, { allowed: false }> => !result.allowed) ?? null;
}
