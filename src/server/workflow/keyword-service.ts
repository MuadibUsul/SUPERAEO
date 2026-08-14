import { resolveTaskExecutionPlan } from "@/server/ai/execution-policies";
import { runJsonPrompt } from "@/server/ai/json-executor";
import {
  buildSemanticKeywordPrompt,
  createSemanticKeywordOutputSchema,
  semanticKeywordPromptVersion,
} from "@/server/ai/prompts/semantic-keyword-generator";
import { getPrisma } from "@/server/db";
import { CipError } from "@/server/observability/errors";
import { recordTraceEvent } from "@/server/observability/event-log";
import { runWithConcurrency } from "@/server/orchestration/concurrency";
import { buildSubjectContext, ensurePrimaryProjectSubject } from "@/server/projects/subject-service";

type GeneratedSemanticKeyword = {
  keyword: string;
  keywordType: "category" | "scenario" | "attribute" | "intent" | "competitor" | "risk";
  targetWeight: number;
  reason: string;
  confidence: number;
};

export async function generateSemanticKeywordsForProject(input: {
  projectId: string;
  requestedByUserId?: string;
  optionalSeedKeywords?: string[];
}) {
  const prisma = getPrisma();
  const project = await prisma.project.findUnique({
    where: { id: input.projectId },
    include: { competitors: true },
  });

  if (!project) {
    throw new Error("Project not found.");
  }

  const subject = await ensurePrimaryProjectSubject(project);
  const subjectContext = buildSubjectContext(project, subject, project.competitors);
  const plan = await resolveTaskExecutionPlan({
    task: "semantic_keyword_generator",
    workUnits: 6,
  });
  const laneCount = Math.min(plan.laneCount, 3);
  const atomicGroups = [
    { key: "category", keywordTypes: ["category"], min: 4, max: 5 },
    { key: "scenario", keywordTypes: ["scenario"], min: 4, max: 5 },
    { key: "attribute", keywordTypes: ["attribute"], min: 4, max: 4 },
    { key: "intent", keywordTypes: ["intent"], min: 4, max: 4 },
    { key: "competitor", keywordTypes: ["competitor"], min: 4, max: 4 },
    { key: "risk", keywordTypes: ["risk"], min: 4, max: 4 },
  ];

  const shards = Array.from({ length: laneCount }, (_, index) => ({
    key: `lane-${index + 1}`,
    keywordTypes: [] as string[],
    minKeywords: 0,
    maxKeywords: 0,
  }));

  atomicGroups.forEach((group, index) => {
    const shard = shards[index % laneCount];
    shard.keywordTypes.push(...group.keywordTypes);
    shard.minKeywords += group.min;
    shard.maxKeywords += group.max;
  });

  const shardResults = await runWithConcurrency(shards, laneCount, async (shard, index, laneIndex) => {
    const lane = plan.lanes[laneIndex % plan.lanes.length];
    const prompt = buildSemanticKeywordPrompt({
      subject: subjectContext,
      optionalSeedKeywords: input.optionalSeedKeywords ?? [],
      keywordTypes: shard.keywordTypes,
      minKeywords: shard.minKeywords,
      maxKeywords: shard.maxKeywords,
    });

    return runJsonPrompt({
      projectId: input.projectId,
      subjectId: subject.id,
      userId: input.requestedByUserId,
      organizationId: project.organizationId ?? undefined,
      providerId: lane.providerId,
      model: lane.model,
      promptName: "semantic_keyword_generator",
      promptVersion: semanticKeywordPromptVersion,
      system: prompt.system,
      prompt: prompt.prompt,
      schema: createSemanticKeywordOutputSchema(shard.minKeywords, shard.maxKeywords),
      schemaName: "semantic_keywords",
      metadata: {
        entityType: subject.entityType,
        subjectId: subject.id,
        shardKey: shard.key,
        shardIndex: index,
        laneIndex,
        laneProvider: lane.providerName,
        laneModel: lane.model,
        strategy: plan.policy.executionStrategy,
      },
    });
  });

  const failedShard = shardResults.find((result) => !result.ok);
  if (failedShard || shardResults.length === 0) {
    await recordTraceEvent({
      severity: "error",
      eventType: "keywords.shard.failed",
      subsystem: "workflow",
      operation: "semantic_keyword_generator",
      status: "failed",
      projectId: input.projectId,
      objectType: "Project",
      objectId: input.projectId,
      metadata: { error: failedShard?.error, shardCount: shardResults.length },
    });
    throw new CipError("语义关键词生成失败，请重试或联系管理员。", {
      errorCode: "SEMANTIC_KEYWORD_GENERATION_FAILED",
      status: 500,
      cause: failedShard?.error ?? "Keyword generation failed.",
    });
  }

  const successfulShards = shardResults.filter(
    (result): result is Extract<(typeof shardResults)[number], { ok: true }> => result.ok,
  );
  const promptRunIds = successfulShards.map((result) => result.promptRunId);
  const rawKeywords = successfulShards.flatMap((result) => result.data.keywords);
  await recordTraceEvent({
    severity: "info",
    eventType: "keywords.merge.started",
    subsystem: "workflow",
    operation: "semantic_keyword_generator",
    status: "started",
    projectId: input.projectId,
    objectType: "Project",
    objectId: input.projectId,
    metadata: { shardCount: successfulShards.length, rawKeywordCount: rawKeywords.length },
  });
  const { keywords: mergedKeywords, duplicateSamples } = mergeSemanticKeywordsForStorage(rawKeywords, 30);

  await recordTraceEvent({
    severity: "info",
    eventType: "keywords.merge.deduplicated",
    subsystem: "workflow",
    operation: "semantic_keyword_generator",
    status: "succeeded",
    projectId: input.projectId,
    objectType: "Project",
    objectId: input.projectId,
    metadata: {
      rawKeywordCount: rawKeywords.length,
      mergedKeywordCount: mergedKeywords.length,
      duplicateSamples,
    },
  });

  if (!hasUsableSemanticKeywordBaseline(mergedKeywords)) {
    throw new CipError("语义关键词生成失败，请重试或联系管理员。", {
      errorCode: "SEMANTIC_KEYWORD_EMPTY_RESULT",
      status: 500,
      metadata: {
        rawKeywordCount: rawKeywords.length,
        mergedKeywordCount: mergedKeywords.length,
      },
    });
  }

  try {
    await prisma.$transaction([
      prisma.semanticKeyword.deleteMany({ where: { projectId: input.projectId } }),
      prisma.semanticKeyword.createMany({
        data: mergedKeywords.map((keyword) => ({
          projectId: input.projectId,
          subjectId: subject.id,
          keyword: keyword.keyword,
          keywordType: keyword.keywordType,
          targetWeight: keyword.targetWeight,
          reason: keyword.reason,
          confidence: keyword.confidence,
        })),
        skipDuplicates: true,
      }),
    ]);
    await recordTraceEvent({
      severity: "info",
      eventType: "keywords.persist.succeeded",
      subsystem: "workflow",
      operation: "semantic_keyword_generator",
      status: "succeeded",
      projectId: input.projectId,
      objectType: "Project",
      objectId: input.projectId,
      metadata: { persistedKeywordCount: mergedKeywords.length },
    });
  } catch (error) {
    await recordTraceEvent({
      severity: "error",
      eventType: "keywords.persist.failed",
      subsystem: "workflow",
      operation: "semantic_keyword_generator",
      status: "failed",
      error,
      projectId: input.projectId,
      objectType: "Project",
      objectId: input.projectId,
      metadata: {
        keywordCount: mergedKeywords.length,
        duplicateSamples,
      },
    });
    throw new CipError("语义关键词生成失败，请重试或联系管理员。", {
      errorCode: "SEMANTIC_KEYWORD_PERSIST_FAILED",
      status: 500,
      cause: error,
      metadata: { keywordCount: mergedKeywords.length },
    });
  }

  const keywords = await prisma.semanticKeyword.findMany({
    where: { projectId: input.projectId },
    orderBy: [{ keywordType: "asc" }, { targetWeight: "desc" }],
  });

  return { keywords, promptRunIds, subject };
}

export function mergeSemanticKeywordsForStorage(input: GeneratedSemanticKeyword[], limit = 30) {
  const byKeyword = new Map<string, GeneratedSemanticKeyword>();
  const duplicateSamples: string[] = [];

  for (const keyword of input) {
    const normalizedKeyword = normalizeKeywordKey(keyword.keyword);
    if (!normalizedKeyword) continue;

    const existing = byKeyword.get(normalizedKeyword);
    if (!existing) {
      byKeyword.set(normalizedKeyword, sanitizeKeyword(keyword));
      continue;
    }

    if (duplicateSamples.length < 10) duplicateSamples.push(keyword.keyword);
    byKeyword.set(normalizedKeyword, mergeDuplicateKeyword(existing, keyword));
  }

  const keywords = Array.from(byKeyword.values())
    .sort((a, b) => b.targetWeight - a.targetWeight || b.confidence - a.confidence)
    .slice(0, limit);

  return { keywords, duplicateSamples };
}

export function hasUsableSemanticKeywordBaseline(keywords: readonly unknown[]) {
  return keywords.length > 0;
}

function mergeDuplicateKeyword(existing: GeneratedSemanticKeyword, incoming: GeneratedSemanticKeyword): GeneratedSemanticKeyword {
  const sanitizedIncoming = sanitizeKeyword(incoming);
  const preferred = sanitizedIncoming.targetWeight > existing.targetWeight ? sanitizedIncoming : existing;
  const secondary = preferred === sanitizedIncoming ? existing : sanitizedIncoming;
  return {
    ...preferred,
    reason: mergeReason(preferred.reason, secondary.reason),
    confidence: Math.max(preferred.confidence, secondary.confidence),
  };
}

function sanitizeKeyword(keyword: GeneratedSemanticKeyword): GeneratedSemanticKeyword {
  return {
    ...keyword,
    keyword: keyword.keyword.trim().replace(/\s+/gu, " "),
    reason: keyword.reason.trim(),
  };
}

function normalizeKeywordKey(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/gu, " ");
}

function mergeReason(primary: string, secondary: string) {
  const first = primary.trim();
  const second = secondary.trim();
  if (!second || first === second || first.includes(second)) return first;
  if (!first) return second;
  return `${first} / ${second}`.slice(0, 360);
}
