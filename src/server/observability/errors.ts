export class CipError extends Error {
  readonly errorCode: string;
  readonly status: number;
  readonly metadata?: Record<string, unknown>;

  constructor(message: string, options: { errorCode?: string; status?: number; metadata?: Record<string, unknown>; cause?: unknown } = {}) {
    super(message, { cause: options.cause });
    this.name = "CipError";
    this.errorCode = options.errorCode ?? "CIP_ERROR";
    this.status = options.status ?? 500;
    this.metadata = options.metadata;
  }
}

export type NormalizedError = {
  errorCode: string;
  safeMessage: string;
  status: number;
  name?: string;
  cause?: unknown;
};

export function normalizeError(error: unknown, fallback: { errorCode?: string; message?: string; status?: number } = {}): NormalizedError {
  if (error instanceof CipError) {
    return {
      errorCode: error.errorCode,
      safeMessage: error.message,
      status: error.status,
      name: error.name,
      cause: error.cause,
    };
  }

  if (isZodErrorLike(error)) {
    return {
      errorCode: fallback.errorCode ?? "VALIDATION_ERROR",
      safeMessage: fallback.message ?? "Invalid request payload.",
      status: fallback.status ?? 400,
      name: "ZodError",
      cause: { issues: error.issues },
    };
  }

  if (error instanceof Error) {
    return {
      errorCode: fallback.errorCode ?? inferErrorCode(error.message),
      safeMessage: fallback.message ?? error.message,
      status: fallback.status ?? inferHttpStatus(error.message),
      name: error.name,
      cause: error.cause,
    };
  }

  return {
    errorCode: fallback.errorCode ?? "UNKNOWN_ERROR",
    safeMessage: fallback.message ?? "Unexpected error.",
    status: fallback.status ?? 500,
    cause: error,
  };
}

function isZodErrorLike(error: unknown): error is { issues: unknown[] } {
  return Boolean(error && typeof error === "object" && Array.isArray((error as { issues?: unknown }).issues));
}

function inferErrorCode(message: string) {
  if (/unauthorized|not authenticated/i.test(message)) return "UNAUTHORIZED";
  if (/forbidden|permission/i.test(message)) return "FORBIDDEN";
  if (/not found/i.test(message)) return "NOT_FOUND";
  if (/rate.?limit|429|too many requests/i.test(message)) return "RATE_LIMITED";
  if (/json|parse|schema|validation/i.test(message)) return "STRUCTURED_OUTPUT_ERROR";
  if (/database|prisma|connection/i.test(message)) return "DATABASE_ERROR";
  return "INTERNAL_ERROR";
}

function inferHttpStatus(message: string) {
  if (/unauthorized|not authenticated/i.test(message)) return 401;
  if (/forbidden|permission/i.test(message)) return 403;
  if (/not found/i.test(message)) return 404;
  if (/rate.?limit|429|too many requests/i.test(message)) return 429;
  if (/validation|invalid/i.test(message)) return 400;
  return 500;
}

