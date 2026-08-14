import type { Prisma } from "@/generated/prisma/client";
import type { AuthSession } from "@/server/auth/session";
import type { ProbeRunConfig, ProbeRunMode, ProbeExecutionMode } from "@/server/brand-probes/types";
import { getProbeRunConfig } from "@/server/brand-probes/config";
import { generateBrandProbes } from "@/server/brand-probes/probe-generator";
import { buildSeedPool } from "@/server/brand-probes/seed-pool-builder";
import { getDefaultOrganizationForUser } from "@/server/auth/organizations";
import { getPrisma } from "@/server/db";
import { buildLegacyBrandSubjectCreateInput } from "@/server/projects/subject-service";

export type BrandProbeRunCreateInput = {
  projectId?: string;
  brand: {
    name: string;
    aliases?: string[];
    category?: string;
    region?: string;
    description?: string;
    competitors?: string[];
    targetMarkets?: string[];
    domain?: string;
  };
  mode?: ProbeRunMode;
  executionMode?: ProbeExecutionMode;
  targetThroughputPerMinute?: number;
  microBatchSize?: number;
  requestRateLimit?: number;
  maxConcurrency?: number;
  tokensPerMinuteBudget?: number;
  model?: string;
  semanticExploration?: boolean;
  analysisJobId?: string;
};

export async function createBrandProbeRun(input: BrandProbeRunCreateInput, session: AuthSession) {
  const project = input.projectId
    ? await findProjectForProbeRun(input.projectId)
    : await createProjectForBrand(input, session);

  if (!project) {
    return { ok: false as const, status: 404, error: "Project was not found." };
  }

  return persistBrandProbeRun(project, input);
}

export async function createBrandProbeRunForProject(input: Omit<BrandProbeRunCreateInput, "brand"> & { projectId: string }) {
  const project = await findProjectForProbeRun(input.projectId);
  if (!project) throw new Error("Project was not found.");
  return persistBrandProbeRun(project, input);
}

async function persistBrandProbeRun(
  project: NonNullable<Awaited<ReturnType<typeof findProjectForProbeRun>>>,
  input: Omit<BrandProbeRunCreateInput, "brand"> | BrandProbeRunCreateInput,
) {
  const prisma = getPrisma();

  const subject = project.subjects.find((item) => item.isPrimary && item.entityType === "BRAND") ?? project.subjects[0] ?? null;
  const config = getProbeRunConfig({
    mode: input.mode,
    executionMode: input.executionMode,
    targetThroughputPerMinute: input.targetThroughputPerMinute,
    microBatchSize: input.microBatchSize,
    requestRateLimit: input.requestRateLimit,
    maxConcurrency: input.maxConcurrency,
    tokensPerMinuteBudget: input.tokensPerMinuteBudget,
    defaultModel: input.model,
  } as Partial<ProbeRunConfig>);
  const seedPool = buildSeedPool({ project, subject, competitors: project.competitors, keywords: project.keywords });
  const generated = generateBrandProbes({ project, subject, seedPool, config, semanticExploration: input.semanticExploration });

  const run = await prisma.brandProbeRun.create({
    data: {
      projectId: project.id,
      subjectId: subject?.id,
      analysisJobId: input.analysisJobId,
      mode: config.mode,
      executionMode: config.executionMode,
      targetProbeCount: generated.length,
      targetThroughputPerMinute: config.targetThroughputPerMinute,
      requestRateLimit: config.requestRateLimit,
      currentRequestRateLimit: config.requestRateLimit,
      maxConcurrency: config.maxConcurrency,
      currentConcurrency: config.maxConcurrency,
      microBatchSize: config.microBatchSize,
      currentBatchSize: config.microBatchSize,
      tokensPerMinuteBudget: config.tokensPerMinuteBudget,
      totalProbes: generated.length,
      configJson: {
        ...config,
        seedPool,
        ...(input.semanticExploration
          ? { semanticExploration: { enabled: true, source: "full_diagnosis" } }
          : {}),
      },
      schedulerStatsJson: {
        targetRequestsPerMinute: Math.ceil(config.targetThroughputPerMinute / config.microBatchSize),
      },
    },
  });

  await prisma.brandProbe.createMany({
    data: generated.map((probe) => ({
      runId: run.id,
      projectId: project.id,
      subjectId: subject?.id,
      dimension: probe.dimension,
      zone: probe.zone,
      questionType: probe.questionType,
      semanticTemperature: probe.semanticTemperature,
      weight: probe.weight,
      samplingWeight: probe.samplingWeight,
      measurementWeight: probe.measurementWeight,
      modelTemperature: probe.modelTemperature,
      language: probe.language,
      prompt: probe.prompt,
      expectedOutputSchema: probe.expectedOutputSchema as Prisma.InputJsonValue,
      variablesJson: probe.variables as Prisma.InputJsonValue,
      qualityScore: probe.qualityScore,
      status: "pending",
    })),
  });

  return { ok: true as const, project, run, config };
}

function findProjectForProbeRun(projectId: string) {
  return getPrisma().project.findFirst({
    where: { id: projectId },
    include: { subjects: true, competitors: true, keywords: true },
  });
}

export async function getBrandProbeRun(runId: string, session: AuthSession) {
  return getPrisma().brandProbeRun.findFirst({
    where: {
      id: runId,
      OR: [
        { project: { userId: session.user.id } },
        { project: { organizationId: { in: session.user.memberships.map((item) => item.organizationId) } } },
      ],
    },
  });
}

export async function summarizeBrandProbeRun(runId: string, session: AuthSession) {
  const run = await getBrandProbeRun(runId, session);
  if (!run) return null;
  const progress = run.totalProbes > 0 ? (run.completedProbes + run.failedProbes) / run.totalProbes : 0;
  const estimatedRemainingSeconds =
    run.actualThroughputPerMinute > 0
      ? Math.ceil(Math.max(0, run.totalProbes - run.completedProbes - run.failedProbes) / run.actualThroughputPerMinute * 60)
      : Math.ceil(Math.max(0, run.totalProbes - run.completedProbes - run.failedProbes) / Math.max(1, run.targetThroughputPerMinute) * 60);
  return {
    run_id: run.id,
    status: run.status,
    total_probes: run.totalProbes,
    completed_probes: run.completedProbes,
    failed_probes: run.failedProbes,
    progress,
    target_throughput_per_minute: run.targetThroughputPerMinute,
    actual_throughput_per_minute: run.actualThroughputPerMinute,
    current_request_rate_limit: run.currentRequestRateLimit,
    current_concurrency: run.currentConcurrency,
    current_batch_size: run.currentBatchSize,
    backpressure_level: run.backpressureLevel,
    throttle_reason: run.throttleReason,
    estimated_remaining_seconds: estimatedRemainingSeconds,
  };
}

async function createProjectForBrand(input: BrandProbeRunCreateInput, session: AuthSession) {
  const organization = await getDefaultOrganizationForUser(session.user.id);
  if (!organization) return null;
  const prisma = getPrisma();
  const brand = input.brand;
  return prisma.project.create({
    data: {
      userId: session.user.id,
      organizationId: organization.id,
      name: `${brand.name} AI semantic probe`,
      brandName: brand.name,
      domain: brand.domain || "",
      industry: brand.category || "品牌",
      targetMarket: brand.targetMarkets?.join(", ") || brand.region || "目标市场",
      language: "zh-CN",
      competitors: {
        create: (brand.competitors ?? []).filter(Boolean).map((name) => ({ name, category: "direct" })),
      },
      subjects: {
        create: {
          ...buildLegacyBrandSubjectCreateInput({
            brandName: brand.name,
            domain: brand.domain || "",
            industry: brand.category || "品牌",
            targetMarket: brand.targetMarkets?.join(", ") || brand.region || "目标市场",
            language: "zh-CN",
          }),
          profileJson: {
            aliases: brand.aliases ?? [],
            description: brand.description,
            source: "brand_probe_run_api",
          },
        },
      },
    },
    include: { subjects: true, competitors: true, keywords: true },
  });
}
