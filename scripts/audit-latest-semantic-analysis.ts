import "dotenv/config";

import { getPrisma } from "@/server/db";

async function main() {
  const projectId = process.argv[2];
  if (!projectId) throw new Error("Usage: tsx scripts/audit-latest-semantic-analysis.ts <projectId>");

  const prisma = getPrisma();
  const run = await prisma.samplingRun.findFirst({
    where: { projectId, responses: { some: {} } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      responses: {
        select: {
          analysis: { select: { id: true, brandMentioned: true, brandRecommended: true, sentiment: true, confidence: true, rawAnalysis: true } },
        },
      },
    },
  });
  const [metric, nebula] = await Promise.all([
    prisma.metricSnapshot.findFirst({ where: { projectId }, orderBy: { createdAt: "desc" } }),
    prisma.semanticNebulaSnapshot.findFirst({ where: { projectId, scope: "OVERALL" }, orderBy: { createdAt: "desc" } }),
  ]);
  const rawNodes: unknown[] = Array.isArray(nebula?.nodeJson) ? nebula.nodeJson : [];
  const nodes = rawNodes.filter(isRecord);

  console.log(JSON.stringify({
    runId: run?.id ?? null,
    responses: run?.responses.length ?? 0,
    analyzedResponses: run?.responses.filter((response) => response.analysis !== null).length ?? 0,
    analysisSignals: {
      mentioned: run?.responses.filter((response) => response.analysis?.brandMentioned).length ?? 0,
      recommended: run?.responses.filter((response) => response.analysis?.brandRecommended).length ?? 0,
      first: run?.responses.find((response) => response.analysis)?.analysis ?? null,
    },
    metrics: metric
      ? {
          mentionRate: metric.mentionRate,
          recommendationShare: metric.recommendationShare,
          citationRate: metric.citationRate,
          descriptionAccuracy: metric.descriptionAccuracy,
          competitorGap: metric.competitorGap,
        }
      : null,
    nebula: {
      nodeCount: nodes.length,
      positionedNodes: nodes.filter((node) => typeof node.x === "number" && typeof node.y === "number" && typeof node.z === "number").length,
      nodesWithModelPositions: nodes.filter((node) => isRecord(node.modelPositions) && Object.keys(node.modelPositions).length > 0).length,
      terms: nodes.slice(0, 20).map((node) => ({ term: node.term, type: node.termType })),
      longestTerms: nodes
        .map((node) => ({ term: String(node.term ?? ""), type: node.termType, examples: node.examples }))
        .sort((left, right) => right.term.length - left.term.length)
        .slice(0, 10),
    },
  }, null, 2));

  await prisma.$disconnect();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
