import type {
  AIModel,
  AIProvider,
  ExecutionStrategy,
  ProviderRoutingRule,
  ProviderSelectionStrategy,
  RoutingTier,
  TaskExecutionPolicy,
} from "@/generated/prisma/client";

import { getDefaultEnabledProvider } from "@/server/ai/provider-config";
import { getPrisma } from "@/server/db";

export const supportedExecutionTasks = [
  "semantic_keyword_generator",
  "query_generator",
  "answer_sampling",
  "long_tail_scenario_generation",
  "question_cluster_generation",
  "opportunity_answer_extraction",
  "semantic_term_extraction",
  "semantic_term_classification",
  "semantic_nebula_build",
  "long_tail_opportunity_generation",
  "question_territory_build",
  "opportunity_probe_sampling",
  "brand_semantic_probe_sampling",
] as const;

export type SupportedExecutionTask = (typeof supportedExecutionTasks)[number];

const defaultPolicies: Record<
  SupportedExecutionTask,
  Omit<TaskExecutionPolicy, "id" | "createdAt" | "updatedAt" | "metadata">
> = {
  semantic_keyword_generator: {
    task: "semantic_keyword_generator",
    tier: "mid_tier_verification",
    enabled: true,
    executionStrategy: "sharded_parallel",
    providerSelection: "priority_spread",
    laneCount: 3,
    minLaneCount: 1,
    maxLaneCount: 3,
    targetLatencySeconds: 60,
    timeoutSeconds: 90,
  },
  query_generator: {
    task: "query_generator",
    tier: "mid_tier_verification",
    enabled: true,
    executionStrategy: "adaptive_parallel",
    providerSelection: "priority_spread",
    laneCount: 4,
    minLaneCount: 2,
    maxLaneCount: 4,
    targetLatencySeconds: 120,
    timeoutSeconds: 120,
  },
  answer_sampling: {
    task: "answer_sampling",
    tier: "low_cost_sampling",
    enabled: true,
    executionStrategy: "adaptive_parallel",
    providerSelection: "round_robin",
    laneCount: 6,
    minLaneCount: 2,
    maxLaneCount: 8,
    targetLatencySeconds: 120,
    timeoutSeconds: 120,
  },
  long_tail_scenario_generation: {
    task: "long_tail_scenario_generation",
    tier: "mid_tier_verification",
    enabled: true,
    executionStrategy: "single_lane",
    providerSelection: "primary_only",
    laneCount: 1,
    minLaneCount: 1,
    maxLaneCount: 2,
    targetLatencySeconds: 90,
    timeoutSeconds: 120,
  },
  question_cluster_generation: {
    task: "question_cluster_generation",
    tier: "mid_tier_verification",
    enabled: true,
    executionStrategy: "single_lane",
    providerSelection: "primary_only",
    laneCount: 1,
    minLaneCount: 1,
    maxLaneCount: 2,
    targetLatencySeconds: 90,
    timeoutSeconds: 120,
  },
  opportunity_answer_extraction: {
    task: "opportunity_answer_extraction",
    tier: "mid_tier_verification",
    enabled: true,
    executionStrategy: "adaptive_parallel",
    providerSelection: "priority_spread",
    laneCount: 3,
    minLaneCount: 1,
    maxLaneCount: 4,
    targetLatencySeconds: 120,
    timeoutSeconds: 120,
  },
  semantic_term_extraction: {
    task: "semantic_term_extraction",
    tier: "mid_tier_verification",
    enabled: true,
    executionStrategy: "single_lane",
    providerSelection: "primary_only",
    laneCount: 1,
    minLaneCount: 1,
    maxLaneCount: 2,
    targetLatencySeconds: 60,
    timeoutSeconds: 90,
  },
  semantic_term_classification: {
    task: "semantic_term_classification",
    tier: "mid_tier_verification",
    enabled: true,
    executionStrategy: "single_lane",
    providerSelection: "primary_only",
    laneCount: 1,
    minLaneCount: 1,
    maxLaneCount: 2,
    targetLatencySeconds: 60,
    timeoutSeconds: 90,
  },
  semantic_nebula_build: {
    task: "semantic_nebula_build",
    tier: "mid_tier_verification",
    enabled: true,
    executionStrategy: "single_lane",
    providerSelection: "primary_only",
    laneCount: 1,
    minLaneCount: 1,
    maxLaneCount: 1,
    targetLatencySeconds: 60,
    timeoutSeconds: 120,
  },
  long_tail_opportunity_generation: {
    task: "long_tail_opportunity_generation",
    tier: "mid_tier_verification",
    enabled: true,
    executionStrategy: "single_lane",
    providerSelection: "primary_only",
    laneCount: 1,
    minLaneCount: 1,
    maxLaneCount: 2,
    targetLatencySeconds: 180,
    timeoutSeconds: 240,
  },
  question_territory_build: {
    task: "question_territory_build",
    tier: "mid_tier_verification",
    enabled: true,
    executionStrategy: "single_lane",
    providerSelection: "primary_only",
    laneCount: 1,
    minLaneCount: 1,
    maxLaneCount: 1,
    targetLatencySeconds: 60,
    timeoutSeconds: 120,
  },
  opportunity_probe_sampling: {
    task: "opportunity_probe_sampling",
    tier: "low_cost_sampling",
    enabled: true,
    executionStrategy: "adaptive_parallel",
    providerSelection: "round_robin",
    laneCount: 4,
    minLaneCount: 1,
    maxLaneCount: 6,
    targetLatencySeconds: 180,
    timeoutSeconds: 180,
  },
  brand_semantic_probe_sampling: {
    task: "brand_semantic_probe_sampling",
    tier: "low_cost_sampling",
    enabled: true,
    executionStrategy: "adaptive_parallel",
    providerSelection: "round_robin",
    laneCount: 24,
    minLaneCount: 15,
    maxLaneCount: 30,
    targetLatencySeconds: 60,
    timeoutSeconds: 120,
  },
};

function isMissingPolicyTable(error: unknown) {
  return (
    error instanceof Error &&
    (error.message.includes("task_execution_policies") ||
      error.message.includes("TaskExecutionPolicy"))
  );
}

type RoutingCandidate = ProviderRoutingRule & {
  provider: AIProvider;
  model: AIModel | null;
};

export type LaneAssignment = {
  laneIndex: number;
  providerId?: string;
  providerName: string;
  model: string;
  source: "routing_rule" | "default_provider";
};

export async function listTaskExecutionPolicies() {
  let stored: TaskExecutionPolicy[] = [];
  try {
    stored = await getPrisma().taskExecutionPolicy.findMany({
      orderBy: { task: "asc" },
    });
  } catch (error) {
    if (!isMissingPolicyTable(error)) {
      throw error;
    }
  }

  return supportedExecutionTasks.map((task) => {
    const policy = stored.find((item) => item.task === task);
    return policy ?? { id: `default:${task}`, ...defaultPolicies[task], metadata: null, createdAt: new Date(0), updatedAt: new Date(0) };
  });
}

export async function getTaskExecutionPolicy(task: SupportedExecutionTask) {
  let policy: TaskExecutionPolicy | null = null;
  try {
    policy = await getPrisma().taskExecutionPolicy.findUnique({ where: { task } });
  } catch (error) {
    if (!isMissingPolicyTable(error)) {
      throw error;
    }
  }
  return policy ?? { id: `default:${task}`, ...defaultPolicies[task], metadata: null, createdAt: new Date(0), updatedAt: new Date(0) };
}

export function resolveLaneCount(input: {
  strategy: ExecutionStrategy;
  laneCount: number;
  minLaneCount: number;
  maxLaneCount: number;
  workUnits: number;
}) {
  const clamp = (value: number) => Math.max(input.minLaneCount, Math.min(input.maxLaneCount, value));

  if (input.strategy === "single_lane") {
    return 1;
  }

  if (input.strategy === "sharded_parallel") {
    return clamp(input.laneCount);
  }

  const heuristic = clamp(Math.ceil(input.workUnits / 20));
  return clamp(Math.max(input.laneCount, heuristic));
}

async function getRoutingCandidates(task: SupportedExecutionTask, tier: RoutingTier) {
  return getPrisma().providerRoutingRule.findMany({
    where: {
      task,
      tier,
      enabled: true,
      provider: { enabled: true },
      OR: [{ modelId: null }, { model: { enabled: true } }],
    },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    include: {
      provider: true,
      model: true,
    },
  });
}

function buildLaneAssignmentsFromCandidates(input: {
  laneCount: number;
  providerSelection: ProviderSelectionStrategy;
  candidates: RoutingCandidate[];
}) {
  const candidates = input.candidates;

  if (candidates.length === 0) {
    return [] as LaneAssignment[];
  }

  if (input.providerSelection === "primary_only") {
    const primary = candidates[0];
    return Array.from({ length: input.laneCount }, (_, laneIndex) => ({
      laneIndex,
      providerId: primary.providerId,
      providerName: primary.provider.name,
      model: primary.model?.name ?? primary.provider.defaultModel,
      source: "routing_rule" as const,
    }));
  }

  const pool =
    input.providerSelection === "priority_spread"
      ? candidates.slice(0, Math.min(input.laneCount, candidates.length))
      : candidates;

  return Array.from({ length: input.laneCount }, (_, laneIndex) => {
    const selected = pool[laneIndex % pool.length];
    return {
      laneIndex,
      providerId: selected.providerId,
      providerName: selected.provider.name,
      model: selected.model?.name ?? selected.provider.defaultModel,
      source: "routing_rule" as const,
    };
  });
}

export async function resolveTaskExecutionPlan(input: {
  task: SupportedExecutionTask;
  workUnits: number;
}) {
  const policy = await getTaskExecutionPolicy(input.task);
  const laneCount = resolveLaneCount({
    strategy: policy.executionStrategy,
    laneCount: policy.laneCount,
    minLaneCount: policy.minLaneCount,
    maxLaneCount: policy.maxLaneCount,
    workUnits: input.workUnits,
  });

  const candidates = await getRoutingCandidates(input.task, policy.tier);
  let lanes = buildLaneAssignmentsFromCandidates({
    laneCount,
    providerSelection: policy.providerSelection,
    candidates,
  });

  if (lanes.length === 0) {
    const provider = await getDefaultEnabledProvider();
    if (!provider) {
      throw new Error("No enabled AI provider is configured.");
    }
    lanes = Array.from({ length: laneCount }, (_, laneIndex) => ({
      laneIndex,
      providerId: provider.id,
      providerName: provider.name,
      model: provider.defaultModel,
      source: "default_provider" as const,
    }));
  }

  return {
    policy,
    laneCount,
    lanes,
  };
}
