-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('hallucination', 'cognitive_bias', 'competitor_jump', 'schema_missing', 'citation_loss', 'entity_confusion');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('P1', 'P2', 'P3');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('open', 'acknowledged', 'resolved', 'dismissed');

-- CreateEnum
CREATE TYPE "AnalysisJobType" AS ENUM ('sampling_run', 'response_analysis', 'stability_analysis', 'semantic_coverage', 'graph_build', 'report_generation');

-- CreateEnum
CREATE TYPE "AnalysisJobStatus" AS ENUM ('queued', 'running', 'completed', 'failed', 'retrying');

-- CreateEnum
CREATE TYPE "ObjectArtifactType" AS ENUM ('ai_response', 'crawl_snapshot', 'analysis_artifact', 'report_export');

-- CreateEnum
CREATE TYPE "PersonaType" AS ENUM ('founder', 'ceo', 'cto', 'buyer', 'marketer', 'consumer', 'analyst');

-- CreateEnum
CREATE TYPE "ContextMode" AS ENUM ('cold_start', 'industry_context', 'competitive_context', 'preference_guided');

-- CreateEnum
CREATE TYPE "QueryDepthLevel" AS ENUM ('primary', 'sub_question', 'implicit', 'decision', 'risk', 'comparison', 'follow_up');

-- CreateEnum
CREATE TYPE "RoutingTier" AS ENUM ('low_cost_sampling', 'mid_tier_verification', 'high_fidelity_audit');

-- AlterTable
ALTER TABLE "ai_responses" ADD COLUMN     "model_id" TEXT,
ADD COLUMN     "object_key" TEXT,
ADD COLUMN     "persona" TEXT,
ADD COLUMN     "provider_id" TEXT,
ADD COLUMN     "region" TEXT,
ADD COLUMN     "sample_index" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "metric_snapshots" ADD COLUMN     "ai_impression_share" DOUBLE PRECISION,
ADD COLUMN     "ai_visibility_score" DOUBLE PRECISION,
ADD COLUMN     "confidence_metadata" JSONB,
ADD COLUMN     "entity_visibility" DOUBLE PRECISION,
ADD COLUMN     "hallucination_risk_score" DOUBLE PRECISION,
ADD COLUMN     "semantic_coverage" DOUBLE PRECISION,
ADD COLUMN     "stability_index" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "queries" ADD COLUMN     "context_mode" "ContextMode" NOT NULL DEFAULT 'cold_start',
ADD COLUMN     "persona_type" "PersonaType",
ADD COLUMN     "query_depth_level" "QueryDepthLevel" NOT NULL DEFAULT 'primary',
ADD COLUMN     "region" TEXT DEFAULT 'US';

-- AlterTable
ALTER TABLE "sampling_runs" ADD COLUMN     "failure_summary" TEXT,
ADD COLUMN     "queue_job_id" TEXT,
ADD COLUMN     "sampling_strategy" JSONB,
ADD COLUMN     "scheduled_at" TIMESTAMP(3),
ADD COLUMN     "trace_id" TEXT;

-- CreateTable
CREATE TABLE "alerts" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "response_id" TEXT,
    "alert_type" "AlertType" NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'open',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "evidence" JSONB,
    "correction_suggestion" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "acknowledged_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entity_profiles" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "entity_name" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL DEFAULT 'Company',
    "ai_definition" TEXT,
    "authority_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "consistency_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "centrality_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cognitive_bias" JSONB,
    "source_evidence" JSONB,
    "graph_node_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "entity_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "citation_sources" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "response_id" TEXT,
    "source_url" TEXT,
    "source_domain" TEXT,
    "source_title" TEXT,
    "citation_rank" INTEGER,
    "citation_context" TEXT,
    "supports_brand" BOOLEAN NOT NULL DEFAULT false,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "citation_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "query_samples" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "query_id" TEXT NOT NULL,
    "response_id" TEXT,
    "sample_index" INTEGER NOT NULL,
    "persona" TEXT,
    "region" TEXT,
    "context_mode" "ContextMode" NOT NULL DEFAULT 'cold_start',
    "status" TEXT NOT NULL DEFAULT 'queued',
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "query_samples_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stability_snapshots" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "run_id" TEXT,
    "metric_name" TEXT NOT NULL,
    "sample_count" INTEGER NOT NULL,
    "mean" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "variance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "standard_deviation" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "entropy" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "stability_index" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stability_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "confidence_intervals" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "run_id" TEXT,
    "metric_name" TEXT NOT NULL,
    "estimate" DOUBLE PRECISION NOT NULL,
    "lower_bound" DOUBLE PRECISION NOT NULL,
    "upper_bound" DOUBLE PRECISION NOT NULL,
    "confidence_level" DOUBLE PRECISION NOT NULL DEFAULT 0.95,
    "sample_count" INTEGER NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'wilson',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "confidence_intervals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "semantic_coverage_snapshots" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "topic_breadth" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "topic_depth" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "intent_coverage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vocabulary_diversity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "overall_coverage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "missing_concepts" JSONB,
    "competitor_gaps" JSONB,
    "evidence" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "semantic_coverage_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "website_crawl_snapshots" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "content_hash" TEXT,
    "object_key" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "website_crawl_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analysis_jobs" (
    "id" TEXT NOT NULL,
    "project_id" TEXT,
    "run_id" TEXT,
    "job_type" "AnalysisJobType" NOT NULL,
    "queue_name" TEXT NOT NULL,
    "queue_job_id" TEXT,
    "trace_id" TEXT NOT NULL,
    "status" "AnalysisJobStatus" NOT NULL DEFAULT 'queued',
    "payload" JSONB NOT NULL,
    "result" JSONB,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analysis_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "object_artifacts" (
    "id" TEXT NOT NULL,
    "project_id" TEXT,
    "artifact_type" "ObjectArtifactType" NOT NULL,
    "bucket" TEXT,
    "object_key" TEXT NOT NULL,
    "content_type" TEXT,
    "byte_size" INTEGER,
    "checksum" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "object_artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_routing_rules" (
    "id" TEXT NOT NULL,
    "task" TEXT NOT NULL,
    "tier" "RoutingTier" NOT NULL,
    "provider_id" TEXT NOT NULL,
    "model_id" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "max_cost_usd" DOUBLE PRECISION,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_routing_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "alerts_project_id_status_severity_idx" ON "alerts"("project_id", "status", "severity");

-- CreateIndex
CREATE INDEX "alerts_response_id_idx" ON "alerts"("response_id");

-- CreateIndex
CREATE INDEX "entity_profiles_project_id_entity_type_idx" ON "entity_profiles"("project_id", "entity_type");

-- CreateIndex
CREATE UNIQUE INDEX "entity_profiles_project_id_entity_name_key" ON "entity_profiles"("project_id", "entity_name");

-- CreateIndex
CREATE INDEX "citation_sources_project_id_source_domain_idx" ON "citation_sources"("project_id", "source_domain");

-- CreateIndex
CREATE INDEX "citation_sources_response_id_idx" ON "citation_sources"("response_id");

-- CreateIndex
CREATE INDEX "query_samples_project_id_run_id_idx" ON "query_samples"("project_id", "run_id");

-- CreateIndex
CREATE UNIQUE INDEX "query_samples_run_id_query_id_sample_index_key" ON "query_samples"("run_id", "query_id", "sample_index");

-- CreateIndex
CREATE INDEX "stability_snapshots_project_id_run_id_idx" ON "stability_snapshots"("project_id", "run_id");

-- CreateIndex
CREATE INDEX "confidence_intervals_project_id_run_id_metric_name_idx" ON "confidence_intervals"("project_id", "run_id", "metric_name");

-- CreateIndex
CREATE INDEX "semantic_coverage_snapshots_project_id_created_at_idx" ON "semantic_coverage_snapshots"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "website_crawl_snapshots_project_id_created_at_idx" ON "website_crawl_snapshots"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "analysis_jobs_project_id_status_idx" ON "analysis_jobs"("project_id", "status");

-- CreateIndex
CREATE INDEX "analysis_jobs_queue_name_queue_job_id_idx" ON "analysis_jobs"("queue_name", "queue_job_id");

-- CreateIndex
CREATE INDEX "analysis_jobs_trace_id_idx" ON "analysis_jobs"("trace_id");

-- CreateIndex
CREATE INDEX "object_artifacts_project_id_artifact_type_idx" ON "object_artifacts"("project_id", "artifact_type");

-- CreateIndex
CREATE INDEX "provider_routing_rules_task_enabled_priority_idx" ON "provider_routing_rules"("task", "enabled", "priority");

-- CreateIndex
CREATE INDEX "ai_responses_provider_id_idx" ON "ai_responses"("provider_id");

-- CreateIndex
CREATE INDEX "ai_responses_model_id_idx" ON "ai_responses"("model_id");

-- CreateIndex
CREATE INDEX "ai_responses_run_id_query_id_sample_index_idx" ON "ai_responses"("run_id", "query_id", "sample_index");

-- CreateIndex
CREATE INDEX "queries_project_id_region_idx" ON "queries"("project_id", "region");

-- CreateIndex
CREATE INDEX "queries_project_id_persona_type_idx" ON "queries"("project_id", "persona_type");

-- CreateIndex
CREATE INDEX "sampling_runs_queue_job_id_idx" ON "sampling_runs"("queue_job_id");

-- AddForeignKey
ALTER TABLE "ai_responses" ADD CONSTRAINT "ai_responses_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "ai_providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_responses" ADD CONSTRAINT "ai_responses_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "ai_models"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_response_id_fkey" FOREIGN KEY ("response_id") REFERENCES "ai_responses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_profiles" ADD CONSTRAINT "entity_profiles_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "citation_sources" ADD CONSTRAINT "citation_sources_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "citation_sources" ADD CONSTRAINT "citation_sources_response_id_fkey" FOREIGN KEY ("response_id") REFERENCES "ai_responses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "query_samples" ADD CONSTRAINT "query_samples_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "query_samples" ADD CONSTRAINT "query_samples_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "sampling_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "query_samples" ADD CONSTRAINT "query_samples_query_id_fkey" FOREIGN KEY ("query_id") REFERENCES "queries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "query_samples" ADD CONSTRAINT "query_samples_response_id_fkey" FOREIGN KEY ("response_id") REFERENCES "ai_responses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stability_snapshots" ADD CONSTRAINT "stability_snapshots_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stability_snapshots" ADD CONSTRAINT "stability_snapshots_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "sampling_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "confidence_intervals" ADD CONSTRAINT "confidence_intervals_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "confidence_intervals" ADD CONSTRAINT "confidence_intervals_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "sampling_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "semantic_coverage_snapshots" ADD CONSTRAINT "semantic_coverage_snapshots_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "website_crawl_snapshots" ADD CONSTRAINT "website_crawl_snapshots_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_jobs" ADD CONSTRAINT "analysis_jobs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_jobs" ADD CONSTRAINT "analysis_jobs_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "sampling_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "object_artifacts" ADD CONSTRAINT "object_artifacts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_routing_rules" ADD CONSTRAINT "provider_routing_rules_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "ai_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_routing_rules" ADD CONSTRAINT "provider_routing_rules_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "ai_models"("id") ON DELETE SET NULL ON UPDATE CASCADE;
