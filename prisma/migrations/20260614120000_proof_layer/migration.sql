-- CreateEnum
CREATE TYPE "ExternalSourceType" AS ENUM ('ga4', 'csv_upload', 'webhook', 'manual');

-- CreateEnum
CREATE TYPE "ExperimentStatus" AS ENUM ('draft', 'running', 'measuring', 'concluded', 'archived');

-- CreateEnum
CREATE TYPE "ExperimentArm" AS ENUM ('treatment', 'control');

-- CreateEnum
CREATE TYPE "ExperimentWaveType" AS ENUM ('baseline', 'retest');

-- AlterTable
ALTER TABLE "probe_templates" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "project_subjects" ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateTable
CREATE TABLE "external_metric_sources" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "source_type" "ExternalSourceType" NOT NULL,
    "name" TEXT NOT NULL,
    "config" JSONB,
    "status" TEXT NOT NULL DEFAULT 'connected',
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_metric_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_metric_points" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "metric_key" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_metric_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cognition_experiments" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "subject_id" TEXT,
    "name" TEXT NOT NULL,
    "hypothesis" TEXT,
    "metric_key" TEXT NOT NULL DEFAULT 'mention_rate',
    "status" "ExperimentStatus" NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cognition_experiments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "experiment_questions" (
    "id" TEXT NOT NULL,
    "experiment_id" TEXT NOT NULL,
    "query_id" TEXT NOT NULL,
    "arm" "ExperimentArm" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "experiment_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "experiment_waves" (
    "id" TEXT NOT NULL,
    "experiment_id" TEXT NOT NULL,
    "wave_type" "ExperimentWaveType" NOT NULL,
    "label" TEXT,
    "run_id" TEXT,
    "measured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "experiment_waves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "experiment_observations" (
    "id" TEXT NOT NULL,
    "wave_id" TEXT NOT NULL,
    "arm" "ExperimentArm" NOT NULL,
    "samples" INTEGER NOT NULL,
    "successes" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "experiment_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "experiment_results" (
    "id" TEXT NOT NULL,
    "experiment_id" TEXT NOT NULL,
    "metric_key" TEXT NOT NULL,
    "treatment_pre_rate" DOUBLE PRECISION NOT NULL,
    "treatment_post_rate" DOUBLE PRECISION NOT NULL,
    "control_pre_rate" DOUBLE PRECISION NOT NULL,
    "control_post_rate" DOUBLE PRECISION NOT NULL,
    "treatment_delta" DOUBLE PRECISION NOT NULL,
    "control_delta" DOUBLE PRECISION NOT NULL,
    "net_lift" DOUBLE PRECISION NOT NULL,
    "z_score" DOUBLE PRECISION NOT NULL,
    "p_value" DOUBLE PRECISION NOT NULL,
    "significant" BOOLEAN NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "experiment_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "external_metric_sources_project_id_source_type_idx" ON "external_metric_sources"("project_id", "source_type");

-- CreateIndex
CREATE INDEX "external_metric_points_project_id_metric_key_date_idx" ON "external_metric_points"("project_id", "metric_key", "date");

-- CreateIndex
CREATE UNIQUE INDEX "external_metric_points_source_id_metric_key_date_key" ON "external_metric_points"("source_id", "metric_key", "date");

-- CreateIndex
CREATE INDEX "cognition_experiments_project_id_status_idx" ON "cognition_experiments"("project_id", "status");

-- CreateIndex
CREATE INDEX "experiment_questions_experiment_id_arm_idx" ON "experiment_questions"("experiment_id", "arm");

-- CreateIndex
CREATE UNIQUE INDEX "experiment_questions_experiment_id_query_id_key" ON "experiment_questions"("experiment_id", "query_id");

-- CreateIndex
CREATE INDEX "experiment_waves_experiment_id_wave_type_idx" ON "experiment_waves"("experiment_id", "wave_type");

-- CreateIndex
CREATE UNIQUE INDEX "experiment_observations_wave_id_arm_key" ON "experiment_observations"("wave_id", "arm");

-- CreateIndex
CREATE INDEX "experiment_results_experiment_id_computed_at_idx" ON "experiment_results"("experiment_id", "computed_at");

-- AddForeignKey
ALTER TABLE "external_metric_sources" ADD CONSTRAINT "external_metric_sources_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_metric_points" ADD CONSTRAINT "external_metric_points_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_metric_points" ADD CONSTRAINT "external_metric_points_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "external_metric_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cognition_experiments" ADD CONSTRAINT "cognition_experiments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cognition_experiments" ADD CONSTRAINT "cognition_experiments_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "project_subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiment_questions" ADD CONSTRAINT "experiment_questions_experiment_id_fkey" FOREIGN KEY ("experiment_id") REFERENCES "cognition_experiments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiment_questions" ADD CONSTRAINT "experiment_questions_query_id_fkey" FOREIGN KEY ("query_id") REFERENCES "queries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiment_waves" ADD CONSTRAINT "experiment_waves_experiment_id_fkey" FOREIGN KEY ("experiment_id") REFERENCES "cognition_experiments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiment_waves" ADD CONSTRAINT "experiment_waves_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "sampling_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiment_observations" ADD CONSTRAINT "experiment_observations_wave_id_fkey" FOREIGN KEY ("wave_id") REFERENCES "experiment_waves"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiment_results" ADD CONSTRAINT "experiment_results_experiment_id_fkey" FOREIGN KEY ("experiment_id") REFERENCES "cognition_experiments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "long_tail_opportunity_snapshots_project_id_subject_id_created_a" RENAME TO "long_tail_opportunity_snapshots_project_id_subject_id_creat_idx";

-- RenameIndex
ALTER INDEX "question_territory_snapshots_project_id_subject_id_created_at_i" RENAME TO "question_territory_snapshots_project_id_subject_id_created__idx";

-- RenameIndex
ALTER INDEX "semantic_nebula_snapshots_project_id_subject_id_scope_created_a" RENAME TO "semantic_nebula_snapshots_project_id_subject_id_scope_creat_idx";

