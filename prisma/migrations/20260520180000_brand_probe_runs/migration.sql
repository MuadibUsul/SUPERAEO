-- AlterEnum
ALTER TYPE "AnalysisJobType" ADD VALUE IF NOT EXISTS 'brand_probe_run';

-- CreateEnum
CREATE TYPE "BrandProbeRunMode" AS ENUM ('demo', 'standard', 'max500');

-- CreateEnum
CREATE TYPE "BrandProbeExecutionMode" AS ENUM ('single', 'micro_batch');

-- CreateEnum
CREATE TYPE "BrandProbeStatus" AS ENUM ('pending', 'queued', 'running', 'completed', 'failed', 'retrying', 'skipped');

-- CreateEnum
CREATE TYPE "BrandProbeZone" AS ENUM ('core_semantics', 'implicit_recommendation', 'competition', 'scenario_fit', 'audience_fit', 'risk_boundary', 'growth_opportunity', 'calibration');

-- CreateEnum
CREATE TYPE "BrandProbeQuestionType" AS ENUM ('explicit_association', 'implicit_recommendation', 'competitor_ranking', 'scenario_fit', 'audience_fit', 'risk_boundary', 'growth_opportunity', 'calibration');

-- CreateEnum
CREATE TYPE "SemanticTemperature" AS ENUM ('hot', 'warm', 'cold');

-- CreateEnum
CREATE TYPE "ExtractedSignalType" AS ENUM ('keyword', 'competitor', 'scenario', 'audience', 'risk', 'sentiment', 'recommendation', 'opportunity');

-- CreateTable
CREATE TABLE "brand_probe_runs" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "subject_id" TEXT,
    "analysis_job_id" TEXT,
    "mode" "BrandProbeRunMode" NOT NULL DEFAULT 'standard',
    "execution_mode" "BrandProbeExecutionMode" NOT NULL DEFAULT 'micro_batch',
    "target_probe_count" INTEGER NOT NULL DEFAULT 360,
    "target_throughput_per_minute" INTEGER NOT NULL DEFAULT 500,
    "actual_throughput_per_minute" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "request_rate_limit" INTEGER NOT NULL DEFAULT 120,
    "current_request_rate_limit" INTEGER NOT NULL DEFAULT 120,
    "max_concurrency" INTEGER NOT NULL DEFAULT 24,
    "current_concurrency" INTEGER NOT NULL DEFAULT 24,
    "micro_batch_size" INTEGER NOT NULL DEFAULT 5,
    "current_batch_size" INTEGER NOT NULL DEFAULT 5,
    "tokens_per_minute_budget" INTEGER NOT NULL DEFAULT 600000,
    "backpressure_level" INTEGER NOT NULL DEFAULT 0,
    "throttle_reason" TEXT,
    "status" "BrandProbeStatus" NOT NULL DEFAULT 'queued',
    "total_probes" INTEGER NOT NULL DEFAULT 0,
    "completed_probes" INTEGER NOT NULL DEFAULT 0,
    "failed_probes" INTEGER NOT NULL DEFAULT 0,
    "current_stage" TEXT,
    "config_json" JSONB,
    "scheduler_stats_json" JSONB,
    "error_message" TEXT,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brand_probe_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brand_probes" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "subject_id" TEXT,
    "dimension" TEXT NOT NULL,
    "zone" "BrandProbeZone" NOT NULL,
    "question_type" "BrandProbeQuestionType" NOT NULL,
    "semantic_temperature" "SemanticTemperature" NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "sampling_weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "measurement_weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "model_temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.3,
    "language" TEXT NOT NULL DEFAULT 'zh-CN',
    "prompt" TEXT NOT NULL,
    "expected_output_schema" JSONB NOT NULL,
    "variables_json" JSONB,
    "quality_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "BrandProbeStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brand_probes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brand_probe_batches" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "batch_index" INTEGER NOT NULL DEFAULT 0,
    "probe_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "batch_size" INTEGER NOT NULL DEFAULT 5,
    "status" "BrandProbeStatus" NOT NULL DEFAULT 'pending',
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "estimated_tokens" INTEGER NOT NULL DEFAULT 0,
    "actual_tokens" INTEGER NOT NULL DEFAULT 0,
    "scheduled_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "latency_ms" INTEGER,
    "degraded_from_batch_id" TEXT,
    "split_reason" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brand_probe_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brand_probe_responses" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "batch_id" TEXT,
    "probe_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "subject_id" TEXT,
    "provider_id" TEXT,
    "model" TEXT NOT NULL,
    "model_version" TEXT,
    "prompt" TEXT NOT NULL,
    "raw_response" TEXT,
    "parsed_json" JSONB,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "total_tokens" INTEGER,
    "cached_input_tokens" INTEGER,
    "reasoning_tokens" INTEGER,
    "cost_estimate" DOUBLE PRECISION,
    "latency_ms" INTEGER,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "brand_probe_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extracted_signals" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "response_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "subject_id" TEXT,
    "probe_id" TEXT NOT NULL,
    "signal_type" "ExtractedSignalType" NOT NULL,
    "raw_value" TEXT NOT NULL,
    "normalized_value" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "extracted_signals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "brand_probe_runs_project_id_created_at_idx" ON "brand_probe_runs"("project_id", "created_at");
CREATE INDEX "brand_probe_runs_subject_id_created_at_idx" ON "brand_probe_runs"("subject_id", "created_at");
CREATE INDEX "brand_probe_runs_status_created_at_idx" ON "brand_probe_runs"("status", "created_at");
CREATE INDEX "brand_probe_runs_analysis_job_id_idx" ON "brand_probe_runs"("analysis_job_id");
CREATE INDEX "brand_probes_run_id_status_idx" ON "brand_probes"("run_id", "status");
CREATE INDEX "brand_probes_project_id_zone_idx" ON "brand_probes"("project_id", "zone");
CREATE INDEX "brand_probes_subject_id_zone_idx" ON "brand_probes"("subject_id", "zone");
CREATE INDEX "brand_probe_batches_run_id_status_idx" ON "brand_probe_batches"("run_id", "status");
CREATE INDEX "brand_probe_batches_project_id_created_at_idx" ON "brand_probe_batches"("project_id", "created_at");
CREATE INDEX "brand_probe_responses_run_id_created_at_idx" ON "brand_probe_responses"("run_id", "created_at");
CREATE INDEX "brand_probe_responses_probe_id_idx" ON "brand_probe_responses"("probe_id");
CREATE INDEX "brand_probe_responses_batch_id_idx" ON "brand_probe_responses"("batch_id");
CREATE INDEX "brand_probe_responses_project_id_created_at_idx" ON "brand_probe_responses"("project_id", "created_at");
CREATE INDEX "extracted_signals_run_id_signal_type_idx" ON "extracted_signals"("run_id", "signal_type");
CREATE INDEX "extracted_signals_response_id_idx" ON "extracted_signals"("response_id");
CREATE INDEX "extracted_signals_project_id_signal_type_idx" ON "extracted_signals"("project_id", "signal_type");

-- AddForeignKey
ALTER TABLE "brand_probe_runs" ADD CONSTRAINT "brand_probe_runs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "brand_probe_runs" ADD CONSTRAINT "brand_probe_runs_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "project_subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "brand_probes" ADD CONSTRAINT "brand_probes_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "brand_probe_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "brand_probes" ADD CONSTRAINT "brand_probes_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "brand_probes" ADD CONSTRAINT "brand_probes_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "project_subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "brand_probe_batches" ADD CONSTRAINT "brand_probe_batches_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "brand_probe_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "brand_probe_batches" ADD CONSTRAINT "brand_probe_batches_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "brand_probe_responses" ADD CONSTRAINT "brand_probe_responses_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "brand_probe_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "brand_probe_responses" ADD CONSTRAINT "brand_probe_responses_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "brand_probe_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "brand_probe_responses" ADD CONSTRAINT "brand_probe_responses_probe_id_fkey" FOREIGN KEY ("probe_id") REFERENCES "brand_probes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "brand_probe_responses" ADD CONSTRAINT "brand_probe_responses_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "brand_probe_responses" ADD CONSTRAINT "brand_probe_responses_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "project_subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "extracted_signals" ADD CONSTRAINT "extracted_signals_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "brand_probe_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "extracted_signals" ADD CONSTRAINT "extracted_signals_response_id_fkey" FOREIGN KEY ("response_id") REFERENCES "brand_probe_responses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "extracted_signals" ADD CONSTRAINT "extracted_signals_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "extracted_signals" ADD CONSTRAINT "extracted_signals_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "project_subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "extracted_signals" ADD CONSTRAINT "extracted_signals_probe_id_fkey" FOREIGN KEY ("probe_id") REFERENCES "brand_probes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
