export function isCognitiveServiceConfigured() {
  return Boolean(process.env.COGNITIVE_SERVICE_URL);
}

export async function callCognitiveService<TInput, TOutput>(
  path: string,
  input: TInput,
) {
  if (!isCognitiveServiceConfigured()) {
    return {
      ok: false as const,
      error: "COGNITIVE_SERVICE_URL is not configured.",
    };
  }

  const response = await fetch(`${process.env.COGNITIVE_SERVICE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const payload = (await response.json().catch(() => null)) as TOutput | null;

  if (!response.ok || !payload) {
    return {
      ok: false as const,
      error: `Cognitive service request failed with ${response.status}.`,
    };
  }

  return { ok: true as const, data: payload };
}

export async function checkCognitiveServiceHealth() {
  if (!isCognitiveServiceConfigured()) {
    return { ok: false, message: "COGNITIVE_SERVICE_URL is not configured." };
  }

  try {
    const response = await fetch(`${process.env.COGNITIVE_SERVICE_URL}/health`);
    return {
      ok: response.ok,
      message: response.ok ? "Cognitive service reachable." : `Health check failed with ${response.status}.`,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Cognitive service health check failed.",
    };
  }
}

