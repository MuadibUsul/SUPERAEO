import type { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/server/db";
import { updateAnalysisJobStage } from "@/server/jobs/stage";
import { ensurePrimaryProjectSubject } from "@/server/projects/subject-service";
import { buildSemanticNebula } from "@/server/semantic-nebula/nebula-builder";
import { attachEntityVectorPositions, buildEntityVectorSpace } from "@/server/semantic-nebula/entity-vector-space";
import type { SemanticCluster } from "@/server/semantic-nebula/semantic-clustering";
import { buildStructuredSemanticNebula, type StructuredSemanticEvidence } from "@/server/semantic-nebula/structured-nebula-builder";
import type { SemanticUnit } from "@/server/semantic-nebula/semantic-unit";
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
  const analyzedResponses = responses.filter((response) => response.analysis !== null);
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
        responses: analyzedResponses,
      },
      scope,
    );

    await updateAnalysisJobStage({
      analysisJobId: input.analysisJobId,
      stage: "NEBULA_BUILDING_GRAPH",
      message: `Persisting ${scope} semantic nebula snapshot.`,
      metadata: {
        nodeCount: graph.nodes.length,
        edgeCount: graph.edges.length,
        analyzedResponseCount: analyzedResponses.length,
        skippedUnanalyzedResponseCount: responses.length - analyzedResponses.length,
      },
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
        nodesToStore = attachEntityVectorPositions(graph.nodes, space);
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

export async function buildSemanticNebulaSnapshotsFromExploration(input: {
  projectId: string;
  subjectId: string;
  brandProbeRunId: string;
  samplingRunId?: string;
  scopes?: NebulaScope[];
  analysisJobId?: string;
}) {
  const prisma = getPrisma();
  await updateAnalysisJobStage({
    analysisJobId: input.analysisJobId,
    stage: "NEBULA_EXTRACTING_TERMS",
    message: "Loading structured semantic units and relations from the completed exploration.",
  });

  const [subject, run, coverageSnapshots] = await Promise.all([
    prisma.projectSubject.findUnique({ where: { id: input.subjectId } }),
    prisma.brandProbeRun.findUnique({
      where: { id: input.brandProbeRunId },
      include: {
        responses: {
          where: { errorMessage: null },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    prisma.semanticCoverageSnapshot.findMany({
      where: { projectId: input.projectId },
      orderBy: { createdAt: "desc" },
      take: 24,
    }),
  ]);
  if (!subject || subject.projectId !== input.projectId) throw new Error("Project subject not found.");
  if (!run || run.projectId !== input.projectId) throw new Error("Brand probe run not found.");

  const coverage = coverageSnapshots.find((snapshot) => asRecord(snapshot.evidence).brandProbeRunId === run.id);
  if (!coverage) throw new Error("Structured semantic coverage snapshot not found for the completed exploration.");
  const coverageEvidence = asRecord(coverage.evidence);
  const units = Array.isArray(coverageEvidence.units)
    ? coverageEvidence.units.filter(isSemanticUnit) as SemanticUnit[]
    : [];
  const clusters = Array.isArray(coverageEvidence.clusters)
    ? coverageEvidence.clusters.filter(isSemanticCluster) as SemanticCluster[]
    : [];
  if (units.length === 0 || clusters.length === 0) {
    throw new Error("The completed exploration contains no structured semantic units or clusters.");
  }

  const exploration = asRecord(coverageEvidence.exploration);
  const iteration = numberValue(exploration.iterations, 1);
  const providerIds = Array.from(new Set(run.responses.map((response) => response.providerId).filter((id): id is string => Boolean(id))));
  const providers = await prisma.aIProvider.findMany({
    where: { id: { in: providerIds } },
    select: { id: true, name: true },
  });
  const providerNames = new Map(providers.map((provider) => [provider.id, provider.name]));
  const evidenceByResponseId = new Map<string, StructuredSemanticEvidence>(
    run.responses.map((response) => [response.id, {
      prompt: response.prompt,
      rawResponse: response.rawResponse,
      provider: response.providerId ? providerNames.get(response.providerId) ?? response.providerId : null,
      model: response.model,
      createdAt: response.createdAt,
    }]),
  );

  await updateAnalysisJobStage({
    analysisJobId: input.analysisJobId,
    stage: "NEBULA_NORMALIZING_TERMS",
    message: "Building the semantic graph from canonical units, clusters, predicates, and negation.",
    metadata: { unitCount: units.length, clusterCount: clusters.length, iteration },
  });

  const requestedScopes = input.scopes?.length ? input.scopes : [...nebulaScopes];
  const snapshots = [];
  for (const scope of requestedScopes) {
    const graph = buildStructuredSemanticNebula({
      subjectName: subject.displayName,
      entityType: subject.entityType,
      scope,
      iteration,
      units,
      clusters,
      evidenceByResponseId,
    });

    let nodesToStore: unknown[] = graph.nodes;
    if (scope === "OVERALL") {
      const space = await buildEntityVectorSpace({
        projectId: input.projectId,
        subjectId: subject.id,
        subjectName: subject.displayName,
        terms: graph.nodes.map((node) => ({ label: node.term, type: String(node.termType) })),
      });
      if (space) nodesToStore = attachEntityVectorPositions(graph.nodes, space);
    }

    await updateAnalysisJobStage({
      analysisJobId: input.analysisJobId,
      stage: "NEBULA_BUILDING_GRAPH",
      message: `Persisting ${scope} structured semantic nebula snapshot.`,
      metadata: { nodeCount: graph.nodes.length, edgeCount: graph.edges.length, brandProbeRunId: run.id },
    });
    snapshots.push(await prisma.semanticNebulaSnapshot.create({
      data: {
        projectId: input.projectId,
        subjectId: subject.id,
        runId: input.samplingRunId,
        scope,
        version: graph.summary.version,
        nodeJson: nodesToStore as Prisma.InputJsonValue,
        edgeJson: graph.edges as Prisma.InputJsonValue,
        summaryJson: {
          ...graph.summary,
          source: "semantic_exploration",
          brandProbeRunId: run.id,
          coverageSnapshotId: coverage.id,
          iteration,
        } as Prisma.InputJsonValue,
        evidenceJson: graph.evidence as Prisma.InputJsonValue,
      },
    }));
  }

  return snapshots;
}

function isSemanticUnit(value: unknown): value is SemanticUnit {
  const unit = asRecord(value);
  return typeof unit.id === "string"
    && typeof unit.canonicalLabel === "string"
    && typeof unit.domain === "string"
    && typeof unit.type === "string"
    && Boolean(unit.source && typeof unit.source === "object");
}

function isSemanticCluster(value: unknown): value is SemanticCluster {
  const cluster = asRecord(value);
  return typeof cluster.id === "string"
    && typeof cluster.representativeLabel === "string"
    && typeof cluster.domain === "string"
    && Array.isArray(cluster.memberIds)
    && Array.isArray(cluster.modelIds)
    && Array.isArray(cluster.relationTypes);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function numberValue(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
