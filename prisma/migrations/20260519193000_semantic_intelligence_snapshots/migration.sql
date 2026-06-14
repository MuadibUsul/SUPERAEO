-- AlterEnum
ALTER TYPE "AnalysisJobType" ADD VALUE IF NOT EXISTS 'semantic_nebula_build';
ALTER TYPE "AnalysisJobType" ADD VALUE IF NOT EXISTS 'long_tail_opportunity_generation';
ALTER TYPE "AnalysisJobType" ADD VALUE IF NOT EXISTS 'question_territory_build';
ALTER TYPE "AnalysisJobType" ADD VALUE IF NOT EXISTS 'opportunity_probe_sampling';

-- CreateTable
CREATE TABLE "semantic_nebula_snapshots" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "run_id" TEXT,
    "scope" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '2026-05-19.v1',
    "node_json" JSONB NOT NULL,
    "edge_json" JSONB NOT NULL,
    "summary_json" JSONB,
    "evidence_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "semantic_nebula_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "long_tail_opportunity_snapshots" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "run_id" TEXT,
    "version" TEXT NOT NULL DEFAULT '2026-05-19.v1',
    "opportunity_json" JSONB NOT NULL,
    "summary_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "long_tail_opportunity_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_territory_snapshots" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "run_id" TEXT,
    "version" TEXT NOT NULL DEFAULT '2026-05-19.v1',
    "territory_json" JSONB NOT NULL,
    "summary_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_territory_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "semantic_nebula_snapshots_project_id_subject_id_scope_created_at_idx" ON "semantic_nebula_snapshots"("project_id", "subject_id", "scope", "created_at");

-- CreateIndex
CREATE INDEX "semantic_nebula_snapshots_run_id_idx" ON "semantic_nebula_snapshots"("run_id");

-- CreateIndex
CREATE INDEX "long_tail_opportunity_snapshots_project_id_subject_id_created_at_idx" ON "long_tail_opportunity_snapshots"("project_id", "subject_id", "created_at");

-- CreateIndex
CREATE INDEX "long_tail_opportunity_snapshots_run_id_idx" ON "long_tail_opportunity_snapshots"("run_id");

-- CreateIndex
CREATE INDEX "question_territory_snapshots_project_id_subject_id_created_at_idx" ON "question_territory_snapshots"("project_id", "subject_id", "created_at");

-- CreateIndex
CREATE INDEX "question_territory_snapshots_run_id_idx" ON "question_territory_snapshots"("run_id");

-- AddForeignKey
ALTER TABLE "semantic_nebula_snapshots" ADD CONSTRAINT "semantic_nebula_snapshots_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "semantic_nebula_snapshots" ADD CONSTRAINT "semantic_nebula_snapshots_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "project_subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "semantic_nebula_snapshots" ADD CONSTRAINT "semantic_nebula_snapshots_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "sampling_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "long_tail_opportunity_snapshots" ADD CONSTRAINT "long_tail_opportunity_snapshots_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "long_tail_opportunity_snapshots" ADD CONSTRAINT "long_tail_opportunity_snapshots_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "project_subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "long_tail_opportunity_snapshots" ADD CONSTRAINT "long_tail_opportunity_snapshots_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "sampling_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_territory_snapshots" ADD CONSTRAINT "question_territory_snapshots_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_territory_snapshots" ADD CONSTRAINT "question_territory_snapshots_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "project_subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_territory_snapshots" ADD CONSTRAINT "question_territory_snapshots_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "sampling_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
