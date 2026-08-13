/**
 * Persist term embeddings in Qdrant so the entity's neighbourhood is queryable
 * (nearest terms = what the model places closest to the entity). Everything
 * guards on isQdrantConfigured(); when Qdrant isn't set up these are no-ops and
 * the caller keeps its existing layout.
 */
import { getQdrantClient, isQdrantConfigured } from "@/server/external/qdrant";

const LEGACY_COLLECTION = "cip_terms";

/** Stable non-negative integer id from a string (Qdrant point id). */
function pointId(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0; // unsigned 32-bit
}

function collectionName(model: string | undefined, version: string | undefined, size: number) {
  return model ? `cip_terms_${pointId(`${model}|${version ?? "v1"}|${size}`).toString(16)}` : LEGACY_COLLECTION;
}

async function ensureCollection(collection: string, size: number): Promise<void> {
  const client = getQdrantClient();
  const existing = await client.getCollections();
  if (!existing.collections.some((c) => c.name === collection)) {
    await client.createCollection(collection, { vectors: { size, distance: "Cosine" } });
  }
  const info = await client.getCollection(collection);
  if (!info.payload_schema?.projectId) {
    await client.createPayloadIndex(collection, { field_name: "projectId", field_schema: "keyword", wait: true });
  }
}

export type TermVector = {
  label: string;
  type: string;
  vector: number[];
  semanticDomain?: string;
  clusterId?: string;
  modelId?: string;
};

/**
 * Upsert the entity + its term vectors for a project/subject. Best-effort:
 * failures are swallowed so vector persistence never blocks a nebula build.
 */
export async function upsertTermVectors(input: {
  projectId: string;
  subjectId?: string | null;
  organizationId?: string | null;
  modelId?: string | null;
  embeddingModel?: string;
  embeddingVersion?: string;
  probeRunId?: string | null;
  terms: TermVector[];
}): Promise<void> {
  if (!isQdrantConfigured() || input.terms.length === 0) return;
  const dim = input.terms.find((t) => t.vector.length > 0)?.vector.length ?? 0;
  if (dim === 0) return;
  try {
    const collection = collectionName(input.embeddingModel, input.embeddingVersion, dim);
    await ensureCollection(collection, dim);
    const points = input.terms
      .filter((t) => t.vector.length === dim)
      .map((t) => ({
        id: pointId(`${input.projectId}:${input.subjectId ?? ""}:${t.modelId ?? input.modelId ?? "aggregate"}:${input.embeddingModel ?? "legacy"}:${input.embeddingVersion ?? "v1"}:${t.semanticDomain ?? ""}:${t.label}`),
        vector: t.vector,
        payload: {
          organizationId: input.organizationId ?? null,
          projectId: input.projectId,
          subjectId: input.subjectId ?? null,
          modelId: t.modelId ?? input.modelId ?? null,
          embeddingModel: input.embeddingModel ?? null,
          embeddingVersion: input.embeddingVersion ?? "v1",
          semanticDomain: t.semanticDomain ?? null,
          clusterId: t.clusterId ?? null,
          probeRunId: input.probeRunId ?? null,
          label: t.label,
          type: t.type,
        },
      }));
    if (points.length > 0) await getQdrantClient().upsert(collection, { points });
  } catch {
    // best-effort: vector persistence is an enhancement, not a hard dependency
  }
}

/** Nearest terms to a query vector within a project (empty when unconfigured). */
export async function nearestTerms(input: {
  projectId: string;
  vector: number[];
  limit?: number;
  embeddingModel?: string;
  embeddingVersion?: string;
}): Promise<Array<{ label: string; type: string; score: number }>> {
  if (!isQdrantConfigured() || input.vector.length === 0) return [];
  try {
    const res = await getQdrantClient().search(collectionName(input.embeddingModel, input.embeddingVersion, input.vector.length), {
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

export async function nearestTermBatch(input: {
  projectId: string;
  subjectId?: string | null;
  embeddingModel: string;
  embeddingVersion?: string;
  queries: Array<{ vector: number[]; semanticDomain: string; modelId?: string }>;
  limit?: number;
}) {
  if (!isQdrantConfigured() || input.queries.length === 0) return input.queries.map(() => [] as Array<{ label: string; clusterId: string; score: number }>);
  const dimensions = input.queries[0].vector.length;
  if (!dimensions || input.queries.some((query) => query.vector.length !== dimensions)) return input.queries.map(() => []);
  try {
    const results = [];
    for (let start = 0; start < input.queries.length; start += 128) {
      const batch = input.queries.slice(start, start + 128);
      results.push(...await getQdrantClient().searchBatch(collectionName(input.embeddingModel, input.embeddingVersion, dimensions), {
        searches: batch.map((query) => ({
          vector: query.vector,
          limit: input.limit ?? 3,
          filter: {
            must: [
              { key: "projectId", match: { value: input.projectId } },
              ...(input.subjectId ? [{ key: "subjectId", match: { value: input.subjectId } }] : []),
              { key: "semanticDomain", match: { value: query.semanticDomain } },
              ...(query.modelId ? [{ key: "modelId", match: { value: query.modelId } }] : []),
            ],
          },
          with_payload: true,
        })),
      }));
    }
    return results.map((items) => items.map((item) => ({
      label: String((item.payload as Record<string, unknown> | undefined)?.label ?? ""),
      clusterId: String((item.payload as Record<string, unknown> | undefined)?.clusterId ?? ""),
      score: item.score,
    })).filter((item) => item.label));
  } catch {
    return input.queries.map(() => []);
  }
}
