/**
 * Embedding client — the substrate for "where an entity sits inside the model".
 *
 * Reuses the platform's own connected providers: it picks an enabled provider
 * flagged `supportsEmbeddings`, decrypts its key, and calls the OpenAI-standard
 * `/embeddings` endpoint on its base URL. So activating embeddings is just
 * "add/enable an embeddings-capable provider" in the operator console — no new
 * secret in code. (DeepSeek has no /embeddings endpoint, so it can't be that
 * provider; OpenAI, a local Ollama `/v1`, Jina, Voyage, etc. can.)
 *
 * An env override (EMBEDDING_API_URL / _API_KEY / _MODEL) still works and wins,
 * for pointing at something not managed as a provider (e.g. local Ollama).
 * Everything downstream guards on the resolved config, so the app runs
 * unchanged until a source exists.
 */
import { getPrisma } from "@/server/db";
import { decryptSecret } from "@/server/security/encryption";
import { asArray, asRecord } from "@/server/utils/coerce";

const DEFAULT_MODEL = "text-embedding-3-small";
const MAX_BATCH = 96;

export type EmbeddingConfig = { url: string; key: string; model: string };

function embeddingsUrl(base: string): string {
  const b = base.replace(/\/+$/, "");
  return /\/embeddings$/.test(b) ? b : `${b}/embeddings`;
}

/**
 * Resolve where to get embeddings: env override first, then the first enabled
 * provider flagged supportsEmbeddings. Returns null when nothing is available.
 */
export async function resolveEmbeddingConfig(): Promise<EmbeddingConfig | null> {
  const envUrl = process.env.EMBEDDING_API_URL;
  if (envUrl) {
    return { url: embeddingsUrl(envUrl), key: process.env.EMBEDDING_API_KEY || "", model: process.env.EMBEDDING_MODEL || DEFAULT_MODEL };
  }
  const provider = await getPrisma().aIProvider.findFirst({
    where: { enabled: true, supportsEmbeddings: true },
    include: { models: { where: { enabled: true } } },
  });
  if (!provider?.baseUrl || !provider.apiKeyEncrypted) return null;
  let key: string;
  try {
    key = decryptSecret(provider.apiKeyEncrypted);
  } catch {
    return null;
  }
  if (!key) return null;
  // prefer a model that actually looks like an embedding model, else default
  const embedModel = provider.models.find((m) => /embed/i.test(m.name))?.name || DEFAULT_MODEL;
  return { url: embeddingsUrl(provider.baseUrl), key, model: embedModel };
}

export async function isEmbeddingConfigured(): Promise<boolean> {
  return (await resolveEmbeddingConfig()) !== null;
}

/** Parse the OpenAI-compatible response, preserving input order via `index`. */
function parseEmbeddings(raw: unknown, expected: number): number[][] {
  const data = asArray(asRecord(raw).data);
  const out: number[][] = new Array(expected);
  data.forEach((entry, i) => {
    const rec = asRecord(entry);
    const idx = typeof rec.index === "number" ? rec.index : i;
    const vec = asArray(rec.embedding).map((v) => Number(v));
    if (idx >= 0 && idx < expected) out[idx] = vec;
  });
  return out;
}

/**
 * Embed a batch of texts (same order out). Pass a resolved config to avoid a
 * second lookup, or let it resolve. Throws if unconfigured or the provider
 * errors — callers treat failure as "keep the existing layout".
 */
export async function embedTexts(texts: string[], config?: EmbeddingConfig): Promise<number[][]> {
  if (texts.length === 0) return [];
  const cfg = config ?? (await resolveEmbeddingConfig());
  if (!cfg) throw new Error("No embedding source: enable a provider with supportsEmbeddings, or set EMBEDDING_API_URL.");

  const results: number[][] = [];
  for (let start = 0; start < texts.length; start += MAX_BATCH) {
    const batch = texts.slice(start, start + MAX_BATCH);
    const response = await fetch(cfg.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(cfg.key ? { Authorization: `Bearer ${cfg.key}` } : {}) },
      body: JSON.stringify({ model: cfg.model, input: batch }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Embedding request failed (${response.status}): ${detail.slice(0, 200)}`);
    }
    const parsed = parseEmbeddings(await response.json(), batch.length);
    for (const vec of parsed) results.push(vec ?? []);
  }
  return results;
}
