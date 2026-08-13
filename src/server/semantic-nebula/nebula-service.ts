import type { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/server/db";
import { updateAnalysisJobStage } from "@/server/jobs/stage";
import { ensurePrimaryProjectSubject } from "@/server/projects/subject-service";
import { buildSemanticNebula } from "@/server/semantic-nebula/nebula-builder";
import { buildEntityVectorSpace } from "@/server/semantic-nebula/entity-vector-space";
import { nebulaScopes, type NebulaScope } from "@/server/semantic-nebula/types";

export async function getLatestSemanticNebulaSnapshots(input: {
  projectId: string;
  subjectId?: string;
}) {
  const prisma = getPrisma();
  const subject = input.subjectId
    ? await prisma.projectSubject.findUnique({ where: { id: input.subjectId } })
    : null;
  const effectiveSubject =
    subject ??
    (await prisma.projectSubject.findFirst({
      where: { projectId: input.projectId, isPrimary: true },
      orderBy: { createdAt: "asc" },
    }));

  if (!effectiveSubject) return [];

  const snapshots = await Promise.all(
    nebulaScopes.map((scope) =>
      prisma.semanticNebulaSnapshot.findFirst({
        where: { projectId: input.projectId, subjectId: effectiveSubject.id, scope },
        orderBy: { createdAt: "desc" },
      }),
    ),
  );

  return snapshots.filter(Boolean);
}

export async function buildSemanticNebulaSnapshots(input: {
  projectId: string;
  subjectId?: string;
  runId?: string;
  scopes?: NebulaScope[];
  analysisJobId?: string;
}) {
  const prisma = getPrisma();
  await updateAnalysisJobStage({
    analysisJobId: input.analysisJobId,
    stage: "NEBULA_EXTRACTING_TERMS",
    message: "Loading sampled answers and extracting observable semantic terms.",
  });

  const project = await prisma.project.findUnique({
    where: { id: input.projectId },
    include: { competitors: true },
  });
  if (!project) throw new Error("Project not found.");

  const subject = input.subjectId
    ? await prisma.projectSubject.findUnique({ where: { id: input.subjectId } })
    : await ensurePrimaryProjectSubject(project);
  if (!subject) throw new Error("Project subject not found.");

  const latestRun = input.runId
    ? await prisma.samplingRun.findUnique({ where: { id: input.runId } })
    : await prisma.samplingRun.findFirst({
        where: { projectId: input.projectId, subjectId: subject.id },
        orderBy: { createdAt: "desc" },
      });

  const [keywords, responses] = await Promise.all([
    prisma.semanticKeyword.findMany({
      where: { projectId: input.projectId, OR: [{ subjectId: subject.id }, { subjectId: null }] },
    }),
    prisma.aIResponse.findMany({
      where: {
        run: {
          projectId: input.projectId,
          ...(latestRun ? { id: latestRun.id } : {}),
          OR: [{ subjectId: subject.id }, { subjectId: null }],
        },
      },
      include: {
        query: true,
        analysis: true,
        provider: { select: { name: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  await updateAnalysisJobStage({
    analysisJobId: input.analysisJobId,
    stage: "NEBULA_NORMALIZING_TERMS",
    message: "Normalizing terms and mapping entity-specific contexts.",
    metadata: { responseCount: responses.length, keywordCount: keywords.length },
  });

  const requestedScopes = input.scopes?.length ? input.scopes : [...nebulaScopes];
  const snapshots = [];

  for (const scope of requestedScopes) {
    await updateAnalysisJobStage({
      analysisJobId: input.analysisJobId,
      stage: "NEBULA_CALCULATING_GRAVITY",
      message: `Calculating semantic gravity for ${scope}.`,
    });

    const graph = buildSemanticNebula(
      {
        subject,
        competitors: project.competitors,
        keywords,
        responses,
      },
      scope,
    );

    await updateAnalysisJobStage({
      analysisJobId: input.analysisJobId,
      stage: "NEBULA_BUILDING_GRAPH",
      message: `Persisting ${scope} semantic nebula snapshot.`,
      metadata: { nodeCount: graph.nodes.length, edgeCount: graph.edges.length },
    });

    // Embed the entity + terms and fold real 3D positions into the OVERALL
    // snapshot when an embeddings-capable provider is enabled. Best-effort:
    // null when unavailable, and the universe falls back to its gravity layout.
    let nodesToStore: unknown[] = graph.nodes;
    if (scope === "OVERALL") {
      const space = await buildEntityVectorSpace({
        projectId: input.projectId,
        subjectId: subject.id,
        subjectName: subject.displayName,
        terms: graph.nodes.map((node) => ({ label: node.term, type: String(node.termType) })),
      });
      if (space) {
        const coord = new Map(space.nodes.map((node) => [node.label, node]));
        nodesToStore = graph.nodes.map((node) => {
          const c = coord.get(node.term);
          return c ? { ...node, x: c.x, y: c.y, z: c.z } : node;
        });
      }
    }

    const snapshot = await prisma.semanticNebulaSnapshot.create({
      data: {
        projectId: input.projectId,
        subjectId: subject.id,
        runId: latestRun?.id,
        scope,
        version: graph.summary.version,
        nodeJson: nodesToStore as Prisma.InputJsonValue,
        edgeJson: graph.edges as Prisma.InputJsonValue,
        summaryJson: graph.summary as Prisma.InputJsonValue,
        evidenceJson: graph.evidence as Prisma.InputJsonValue,
      },
    });
    snapshots.push(snapshot);
  }

  return snapshots;
}

