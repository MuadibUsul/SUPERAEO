/**
 * Embedding client — the substrate for "where an entity sits inside the model".
 *
 * Provider-agnostic against the de-facto OpenAI `/embeddings` shape, so it
 * works with OpenAI, a local Ollama server (`/v1`), Jina, Voyage, etc. by env
 * alone — plug in a key later without touching code:
 *   EMBEDDING_API_URL   base, e.g. https://api.openai.com/v1  or  http://localhost:11434/v1
 *   EMBEDDING_API_KEY   bearer token (optional for local servers)
 *   EMBEDDING_MODEL     e.g. text-embedding-3-small | nomic-embed-text | bge-m3
 *
 * Everything downstream guards on isEmbeddingConfigured(), so the app runs
 * unchanged until a source is provided.
 */
import { asArray, asRecord } from "@/server/utils/coerce";

const DEFAULT_MODEL = "text-embedding-3-small";
const MAX_BATCH = 96;

export function isEmbeddingConfigured(): boolean {
  return Boolean(process.env.EMBEDDING_API_URL);
}

export function embeddingModel(): string {
  return process.env.EMBEDDING_MODEL || DEFAULT_MODEL;
}

function endpoint(): string {
  const base = (process.env.EMBEDDING_API_URL || "").replace(/\/+$/, "");
  return /\/embeddings$/.test(base) ? base : `${base}/embeddings`;
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
 * Embed a batch of texts. Returns one vector per input (same order).
 * Throws if unconfigured or the provider errors — callers guard with
 * isEmbeddingConfigured() and treat failure as "keep the existing layout".
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (!isEmbeddingConfigured()) throw new Error("Embedding source is not configured (set EMBEDDING_API_URL).");
  if (texts.length === 0) return [];

  const model = embeddingModel();
  const key = process.env.EMBEDDING_API_KEY;
  const url = endpoint();
  const results: number[][] = [];

  for (let start = 0; start < texts.length; start += MAX_BATCH) {
    const batch = texts.slice(start, start + MAX_BATCH);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
      },
      body: JSON.stringify({ model, input: batch }),
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
