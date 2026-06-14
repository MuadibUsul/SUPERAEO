const DEFAULT_REDACT_KEYS = [
  "authorization",
  "cookie",
  "database_url",
  "apikey",
  "api_key",
  "api-key",
  "password",
  "secret",
  "session",
  "token",
];

const MAX_STRING_LENGTH = 1200;
const MAX_ARRAY_LENGTH = 25;
const MAX_DEPTH = 6;

export function redactSensitiveValue(value: unknown): unknown {
  return redactValue(value, new WeakSet<object>(), 0);
}

function redactValue(value: unknown, seen: WeakSet<object>, depth: number): unknown {
  if (value == null) return value;
  if (typeof value === "string") return truncate(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return {
      name: value.name,
      message: truncate(value.message),
      stack: truncate(value.stack),
      cause: redactValue(value.cause, seen, depth + 1),
    };
  }
  if (typeof value !== "object") return String(value);
  if (seen.has(value)) return "[Circular]";
  if (depth >= MAX_DEPTH) return "[MaxDepth]";

  seen.add(value);

  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_LENGTH).map((item) => redactValue(item, seen, depth + 1));
  }

  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    output[key] = shouldRedactKey(key) ? "[REDACTED]" : redactValue(entry, seen, depth + 1);
  }
  return output;
}

function shouldRedactKey(key: string) {
  const normalized = key.toLowerCase().replace(/[^a-z0-9_:-]/g, "");
  return getRedactKeys().some((redactKey) => normalized.includes(redactKey));
}

function getRedactKeys() {
  const extra = (process.env.CIP_LOG_REDACT_KEYS ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return [...DEFAULT_REDACT_KEYS, ...extra];
}

function truncate(value: string | undefined) {
  if (!value) return value;
  return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}...[truncated]` : value;
}

