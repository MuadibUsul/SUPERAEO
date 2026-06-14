import type { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/server/db";
import { entropy, stabilityIndex, variance, wilsonInterval } from "@/server/observability/statistics";

export async function createRunStatistics(projectId: string, runId: string) {
  const prisma = getPrisma();
  const responses = await prisma.aIResponse.findMany({
    where: { runId },
    include: {
      analysis: true,
      citationSources: true,
      probeResults: {
        where: { probeFamily: "answer_extraction" },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });
  const sampleCount = responses.length;
  const mentions = responses.map((response) => targetMentioned(response));
  const citations = responses.map((response) => targetCited(response));
  const mentionValues: number[] = mentions.map((value) => (value ? 1 : 0));
  const citationValues: number[] = citations.map((value) => (value ? 1 : 0));
  const mentionSuccesses = mentionValues.reduce((sum, value) => sum + value, 0);
  const citationSuccesses = citationValues.reduce((sum, value) => sum + value, 0);

  const stability = await prisma.stabilitySnapshot.create({
    data: {
      projectId,
      runId,
      metricName: "brand_mention",
      sampleCount,
      mean: sampleCount ? mentionSuccesses / sampleCount : 0,
      variance: variance(mentionValues),
      standardDeviation: Math.sqrt(variance(mentionValues)),
      entropy: entropy(mentions.map(String)),
      stabilityIndex: stabilityIndex(mentions),
      metadata: {
        citationStabilityIndex: stabilityIndex(citations),
      } as Prisma.InputJsonValue,
    },
  });

  const mentionInterval = wilsonInterval(mentionSuccesses, sampleCount);
  const citationInterval = wilsonInterval(citationSuccesses, sampleCount);

  await prisma.confidenceInterval.createMany({
    data: [
      {
        projectId,
        runId,
        metricName: "mention_rate",
        estimate: mentionInterval.estimate,
        lowerBound: mentionInterval.lowerBound,
        upperBound: mentionInterval.upperBound,
        sampleCount,
      },
      {
        projectId,
        runId,
        metricName: "citation_rate",
        estimate: citationInterval.estimate,
        lowerBound: citationInterval.lowerBound,
        upperBound: citationInterval.upperBound,
        sampleCount,
      },
    ],
  });

  return stability;
}

type ResponseWithNormalizedResult = {
  analysis: { brandMentioned: boolean } | null;
  citationSources: Array<{ supportsBrand: boolean }>;
  probeResults: Array<{ normalizedJson: unknown }>;
};

function targetMentioned(response: ResponseWithNormalizedResult) {
  const normalized = normalizedResult(response);
  if (typeof normalized.targetMentioned === "boolean") return normalized.targetMentioned;
  return Boolean(response.analysis?.brandMentioned);
}

function targetCited(response: ResponseWithNormalizedResult) {
  const normalized = normalizedResult(response);
  const citations = Array.isArray(normalized.citations) ? normalized.citations : [];
  if (citations.some((citation) => isRecord(citation) && citation.supportsTarget === true)) return true;
  return response.citationSources.some((citation) => citation.supportsBrand);
}

function normalizedResult(response: ResponseWithNormalizedResult) {
  const value = response.probeResults[0]?.normalizedJson;
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
