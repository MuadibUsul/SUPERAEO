import { resolveTaskExecutionPlan } from "@/server/ai/execution-policies";
import { runJsonPrompt } from "@/server/ai/json-executor";
import {
  buildQueryGeneratorPrompt,
  createQueryGeneratorOutputSchema,
  queryGeneratorPromptVersion,
} from "@/server/ai/prompts/query-generator";
import { getPrisma } from "@/server/db";
import { runWithConcurrency } from "@/server/orchestration/concurrency";
import { buildSubjectContext, ensurePrimaryProjectSubject } from "@/server/projects/subject-service";
import type { generateQueriesRequestSchema } from "@/server/validation/workflow";
import type { z } from "zod";

type QueryGenerationOptions = z.output<typeof generateQueriesRequestSchema>;

export async function generateQueriesForProject(input: {
  projectId: string;
  requestedByUserId?: string;
  options: QueryGenerationOptions;
}) {
  if (input.options.minQueries > input.options.maxQueries) {
    throw new Error("Invalid query generation range.");
  }

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
  const keywords = await prisma.semanticKeyword.findMany({
    where: { projectId: input.projectId, OR: [{ subjectId: subject.id }, { subjectId: null }] },
  });
  const plan = await resolveTaskExecutionPlan({
    task: "query_generator",
    workUnits: input.options.maxQueries,
  });
  const laneCount = Math.min(plan.laneCount, 4);
  const shardTemplates = [
    { key: "recommendation", queryTypes: ["recommendation", "best_tools"] },
    { key: "comparison", queryTypes: ["comparison", "alternative"] },
    { key: "decision", queryTypes: ["pricing", "buyer_decision"] },
    { key: "coverage", queryTypes: ["use_case", "risk", "implementation", "education"] },
  ].slice(0, laneCount);

  const minPerShard = Math.max(5, Math.floor(input.options.minQueries / laneCount));
  const maxPerShard = Math.max(minPerShard, Math.ceil(input.options.maxQueries / laneCount) + 2);

  const shardResults = await runWithConcurrency(shardTemplates, laneCount, async (shard, index, laneIndex) => {
    const lane = plan.lanes[laneIndex % plan.lanes.length];
    const prompt = buildQueryGeneratorPrompt({
      subject: subjectContext,
      keywords,
      minQueries: minPerShard,
      maxQueries: maxPerShard,
      personaTypes: input.options.personaTypes,
      regions: input.options.regions,
      contextModes: input.options.contextModes,
      queryDepthLevels: input.options.queryDepthLevels,
      queryTypes: shard.queryTypes,
    });

    return runJsonPrompt({
      projectId: input.projectId,
      subjectId: subject.id,
      userId: input.requestedByUserId,
      organizationId: project.organizationId ?? undefined,
      providerId: lane.providerId,
      model: lane.model,
      promptName: "query_generator",
      promptVersion: queryGeneratorPromptVersion,
      system: prompt.system,
      prompt: prompt.prompt,
      schema: createQueryGeneratorOutputSchema(minPerShard, maxPerShard),
      schemaName: "buyer_intent_queries",
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
    throw new Error(failedShard?.error ?? "Query generation failed.");
  }

  const successfulShards = shardResults.filter(
    (result): result is Extract<(typeof shardResults)[number], { ok: true }> => result.ok,
  );
  const promptRunIds = successfulShards.map((result) => result.promptRunId);
  const mergedQueries = Array.from(
    new Map(
      successfulShards
        .flatMap((result) => result.data.queries)
        .map((query) => [query.queryText.trim().toLowerCase(), query]),
    ).values(),
  ).slice(0, input.options.maxQueries);

  if (mergedQueries.length < input.options.minQueries) {
    throw new Error("Query generation returned too few validated results after merging shard outputs.");
  }

  const keywordByName = new Map(keywords.map((keyword) => [keyword.keyword.toLowerCase(), keyword.id]));

  await prisma.aeoQuery.deleteMany({ where: { projectId: input.projectId } });
  await prisma.aeoQuery.createMany({
    data: mergedQueries.map((query, index) => ({
      projectId: input.projectId,
      subjectId: subject.id,
      queryText: query.queryText,
      queryType: query.queryType,
      persona: query.persona,
      personaType: input.options.personaTypes[index % input.options.personaTypes.length],
      region: input.options.regions[index % input.options.regions.length],
      contextMode: input.options.contextModes[index % input.options.contextModes.length],
      queryDepthLevel: input.options.queryDepthLevels[index % input.options.queryDepthLevels.length],
      intent: query.intent,
      targetKeywordId: query.targetKeyword ? keywordByName.get(query.targetKeyword.toLowerCase()) : undefined,
      confidence: query.confidence,
    })),
  });

  const queries = await prisma.aeoQuery.findMany({
    where: { projectId: input.projectId },
    orderBy: { createdAt: "asc" },
  });

  return { queries, promptRunIds, subject };
}
