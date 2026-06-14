CREATE TYPE "ExecutionStrategy" AS ENUM ('single_lane', 'sharded_parallel', 'adaptive_parallel');
CREATE TYPE "ProviderSelectionStrategy" AS ENUM ('primary_only', 'round_robin', 'priority_spread');

CREATE TABLE "task_execution_policies" (
    "id" TEXT NOT NULL,
    "task" TEXT NOT NULL,
    "tier" "RoutingTier" NOT NULL DEFAULT 'mid_tier_verification',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "execution_strategy" "ExecutionStrategy" NOT NULL DEFAULT 'single_lane',
    "provider_selection" "ProviderSelectionStrategy" NOT NULL DEFAULT 'primary_only',
    "lane_count" INTEGER NOT NULL DEFAULT 1,
    "min_lane_count" INTEGER NOT NULL DEFAULT 1,
    "max_lane_count" INTEGER NOT NULL DEFAULT 4,
    "target_latency_seconds" INTEGER NOT NULL DEFAULT 120,
    "timeout_seconds" INTEGER NOT NULL DEFAULT 90,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_execution_policies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "task_execution_policies_task_key" ON "task_execution_policies"("task");
CREATE INDEX "task_execution_policies_enabled_task_idx" ON "task_execution_policies"("enabled", "task");
