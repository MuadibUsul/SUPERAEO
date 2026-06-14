import { QdrantClient } from "@qdrant/js-client-rest";

let qdrantClient: QdrantClient | null = null;

export function isQdrantConfigured() {
  return Boolean(process.env.QDRANT_URL);
}

export function getQdrantClient() {
  if (!isQdrantConfigured()) {
    throw new Error("Qdrant is not configured.");
  }

  if (!qdrantClient) {
    qdrantClient = new QdrantClient({
      url: process.env.QDRANT_URL!,
      apiKey: process.env.QDRANT_API_KEY || undefined,
    });
  }

  return qdrantClient;
}

export async function checkQdrantHealth() {
  if (!isQdrantConfigured()) {
    return { ok: false, message: "QDRANT_URL is not configured." };
  }

  try {
    await getQdrantClient().getCollections();
    return { ok: true, message: "Qdrant reachable." };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Qdrant health check failed.",
    };
  }
}

