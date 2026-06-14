-- CreateEnum
CREATE TYPE "SubjectEntityType" AS ENUM ('BRAND', 'PERSON', 'WEBSITE', 'PRODUCT');

-- CreateTable
CREATE TABLE "project_subjects" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "entity_type" "SubjectEntityType" NOT NULL,
    "display_name" TEXT NOT NULL,
    "canonical_name" TEXT NOT NULL,
    "website_url" TEXT,
    "market" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en',
    "profile_json" JSONB,
    "is_primary" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "probe_templates" (
    "id" TEXT NOT NULL,
    "entity_type" "SubjectEntityType" NOT NULL,
    "probe_family" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "prompt_template" TEXT NOT NULL,
    "output_schema_json" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "probe_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "probe_results" (
    "id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "query_id" TEXT,
    "probe_family" TEXT NOT NULL,
    "normalized_json" JSONB NOT NULL,
    "score_json" JSONB,
    "evidence_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "probe_results_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "semantic_keywords" ADD COLUMN "subject_id" TEXT;

-- AlterTable
ALTER TABLE "queries" ADD COLUMN "subject_id" TEXT;

-- AlterTable
ALTER TABLE "sampling_runs" ADD COLUMN "subject_id" TEXT;

-- AlterTable
ALTER TABLE "prompt_runs" ADD COLUMN "subject_id" TEXT;

-- AlterTable
ALTER TABLE "metric_snapshots" ADD COLUMN "subject_id" TEXT;

-- Backfill one primary BRAND subject per existing project.
INSERT INTO "project_subjects" (
    "id",
    "project_id",
    "entity_type",
    "display_name",
    "canonical_name",
    "website_url",
    "market",
    "language",
    "profile_json",
    "is_primary",
    "created_at",
    "updated_at"
)
SELECT
    'subj_' || substr(md5("id"), 1, 20),
    "id",
    'BRAND'::"SubjectEntityType",
    "brand_name",
    lower("brand_name"),
    "domain",
    "target_market",
    "language",
    jsonb_build_object(
      'legacyProjectId', "id",
      'brandName', "brand_name",
      'domain', "domain",
      'industry', "industry",
      'targetMarket', "target_market",
      'source', 'legacy_project_backfill'
    ),
    true,
    "created_at",
    CURRENT_TIMESTAMP
FROM "projects"
ON CONFLICT DO NOTHING;

-- Backfill subject references for existing project-scoped records.
UPDATE "semantic_keywords" sk
SET "subject_id" = ps."id"
FROM "project_subjects" ps
WHERE sk."project_id" = ps."project_id" AND ps."is_primary" = true AND sk."subject_id" IS NULL;

UPDATE "queries" q
SET "subject_id" = ps."id"
FROM "project_subjects" ps
WHERE q."project_id" = ps."project_id" AND ps."is_primary" = true AND q."subject_id" IS NULL;

UPDATE "sampling_runs" sr
SET "subject_id" = ps."id"
FROM "project_subjects" ps
WHERE sr."project_id" = ps."project_id" AND ps."is_primary" = true AND sr."subject_id" IS NULL;

UPDATE "prompt_runs" pr
SET "subject_id" = ps."id"
FROM "project_subjects" ps
WHERE pr."project_id" = ps."project_id" AND ps."is_primary" = true AND pr."subject_id" IS NULL;

UPDATE "metric_snapshots" ms
SET "subject_id" = ps."id"
FROM "project_subjects" ps
WHERE ms."project_id" = ps."project_id" AND ps."is_primary" = true AND ms."subject_id" IS NULL;

-- CreateIndex
CREATE INDEX "project_subjects_project_id_is_primary_idx" ON "project_subjects"("project_id", "is_primary");

-- CreateIndex
CREATE INDEX "project_subjects_entity_type_idx" ON "project_subjects"("entity_type");

-- CreateIndex
CREATE UNIQUE INDEX "project_subjects_project_id_canonical_name_entity_type_key" ON "project_subjects"("project_id", "canonical_name", "entity_type");

-- CreateIndex
CREATE INDEX "semantic_keywords_subject_id_keyword_type_idx" ON "semantic_keywords"("subject_id", "keyword_type");

-- CreateIndex
CREATE INDEX "queries_subject_id_query_type_idx" ON "queries"("subject_id", "query_type");

-- CreateIndex
CREATE INDEX "sampling_runs_subject_id_run_type_status_idx" ON "sampling_runs"("subject_id", "run_type", "status");

-- CreateIndex
CREATE INDEX "prompt_runs_subject_id_prompt_name_idx" ON "prompt_runs"("subject_id", "prompt_name");

-- CreateIndex
CREATE INDEX "metric_snapshots_subject_id_run_id_idx" ON "metric_snapshots"("subject_id", "run_id");

-- CreateIndex
CREATE INDEX "probe_templates_entity_type_is_active_idx" ON "probe_templates"("entity_type", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "probe_templates_entity_type_probe_family_version_locale_key" ON "probe_templates"("entity_type", "probe_family", "version", "locale");

-- CreateIndex
CREATE INDEX "probe_results_subject_id_probe_family_idx" ON "probe_results"("subject_id", "probe_family");

-- CreateIndex
CREATE INDEX "probe_results_run_id_probe_family_idx" ON "probe_results"("run_id", "probe_family");

-- CreateIndex
CREATE INDEX "probe_results_query_id_idx" ON "probe_results"("query_id");

-- AddForeignKey
ALTER TABLE "project_subjects" ADD CONSTRAINT "project_subjects_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "semantic_keywords" ADD CONSTRAINT "semantic_keywords_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "project_subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queries" ADD CONSTRAINT "queries_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "project_subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sampling_runs" ADD CONSTRAINT "sampling_runs_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "project_subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prompt_runs" ADD CONSTRAINT "prompt_runs_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "project_subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_snapshots" ADD CONSTRAINT "metric_snapshots_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "project_subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "probe_results" ADD CONSTRAINT "probe_results_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "project_subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "probe_results" ADD CONSTRAINT "probe_results_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "sampling_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "probe_results" ADD CONSTRAINT "probe_results_query_id_fkey" FOREIGN KEY ("query_id") REFERENCES "queries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
