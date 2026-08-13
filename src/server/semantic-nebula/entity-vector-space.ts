/**
 * Build the entity's position inside the model — the product's core purpose.
 *
 * Embeds the subject and every semantic term, projects them to 3D with the
 * SUBJECT AT THE ORIGIN (so each term's coordinate reads as "where the model
 * places this meaning relative to the entity"), persists the vectors in
 * Qdrant, and returns nodes the cognition-universe renderer consumes.
 *
 * Returns null when no embedding source is configured, so callers fall back to
 * the existing gravity layout with zero behaviour change.
 */
import { embedTexts, resolveEmbeddingConfig } from "@/server/ai/embeddings";
import { projectTo3D } from "@/server/semantic-nebula/vector-projection";
import { upsertTermVectors } from "@/server/semantic-nebula/vector-store";

export type TermInput = { label: string; type: string };
export type VectorNode = { label: string; type: string; x: number; y: number; z: number };

export type EntityVectorSpace = {
  model: string;
  dims: number;
  nodes: VectorNode[];
};

export async function buildEntityVectorSpace(input: {
  projectId: string;
  subjectId?: string | null;
  subjectName: string;
  terms: TermInput[];
}): Promise<EntityVectorSpace | null> {
  const cfg = await resolveEmbeddingConfig();
  if (!cfg || input.terms.length === 0) return null;

  try {
    // index 0 is the subject; the rest are terms (kept in order)
    const labels = [input.subjectName, ...input.terms.map((t) => t.label)];
    const vectors = await embedTexts(labels, cfg);
    if (vectors.length !== labels.length || vectors.some((v) => v.length === 0)) return null;

    const coords = projectTo3D(vectors, 0); // subject -> origin
    const nodes: VectorNode[] = input.terms.map((t, i) => ({
      label: t.label,
      type: t.type,
      x: coords[i + 1].x,
      y: coords[i + 1].y,
      z: coords[i + 1].z,
    }));

    // best-effort persistence (no-op if Qdrant isn't configured)
    await upsertTermVectors({
      projectId: input.projectId,
      subjectId: input.subjectId,
      terms: input.terms.map((t, i) => ({ label: t.label, type: t.type, vector: vectors[i + 1] })),
    });

    return { model: cfg.model, dims: vectors[0].length, nodes };
  } catch {
    return null; // best-effort — never block the nebula build
  }
}
