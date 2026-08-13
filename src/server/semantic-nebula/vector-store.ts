/**
 * Persist term embeddings in Qdrant so the entity's neighbourhood is queryable
 * (nearest terms = what the model places closest to the entity). Everything
 * guards on isQdrantConfigured(); when Qdrant isn't set up these are no-ops and
 * the caller keeps its existing layout.
 */
import { getQdrantClient, isQdrantConfigured } from "@/server/external/qdrant";

const COLLECTION = "cip_terms";

/** Stable non-negative integer id from a string (Qdrant point id). */
function pointId(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0; // unsigned 32-bit
}

async function ensureCollection(size: number): Promise<void> {
  const client = getQdrantClient();
  const existing = await client.getCollections();
  if (!existing.collections.some((c) => c.name === COLLECTION)) {
    await client.createCollection(COLLECTION, { vectors: { size, distance: "Cosine" } });
  }
  const info = await client.getCollection(COLLECTION);
  if (!info.payload_schema?.projectId) {
    await client.createPayloadIndex(COLLECTION, { field_name: "projectId", field_schema: "keyword", wait: true });
  }
}

export type TermVector = {
  label: string;
  type: string;
  vector: number[];
};

/**
 * Upsert the entity + its term vectors for a project/subject. Best-effort:
 * failures are swallowed so vector persistence never blocks a nebula build.
 */
export async function upsertTermVectors(input: {
  projectId: string;
  subjectId?: string | null;
  terms: TermVector[];
}): Promise<void> {
  if (!isQdrantConfigured() || input.terms.length === 0) return;
  const dim = input.terms.find((t) => t.vector.length > 0)?.vector.length ?? 0;
  if (dim === 0) return;
  try {
    await ensureCollection(dim);
    const points = input.terms
      .filter((t) => t.vector.length === dim)
      .map((t) => ({
        id: pointId(`${input.projectId}:${input.subjectId ?? ""}:${t.label}`),
        vector: t.vector,
        payload: { projectId: input.projectId, subjectId: input.subjectId ?? null, label: t.label, type: t.type },
      }));
    if (points.length > 0) await getQdrantClient().upsert(COLLECTION, { points });
  } catch {
    // best-effort: vector persistence is an enhancement, not a hard dependency
  }
}

/** Nearest terms to a query vector within a project (empty when unconfigured). */
export async function nearestTerms(input: {
  projectId: string;
  vector: number[];
  limit?: number;
}): Promise<Array<{ label: string; type: string; score: number }>> {
  if (!isQdrantConfigured() || input.vector.length === 0) return [];
  try {
    const res = await getQdrantClient().search(COLLECTION, {
      vector: input.vector,
      limit: input.limit ?? 12,
      filter: { must: [{ key: "projectId", match: { value: input.projectId } }] },
      with_payload: true,
    });
    return res.map((r) => ({
      label: String((r.payload as Record<string, unknown> | undefined)?.label ?? ""),
      type: String((r.payload as Record<string, unknown> | undefined)?.type ?? ""),
      score: r.score,
    }));
  } catch {
    return [];
  }
}
