-- Promote the audit trace id out of the JSONB `metadata` blob and onto a real,
-- indexed column. The diagnosis status endpoint polls every few seconds while an
-- audit runs, and filtering on a JSONB path forced a sequential scan each time.
ALTER TABLE "ai_usage_logs" ADD COLUMN "trace_id" TEXT;
ALTER TABLE "prompt_runs" ADD COLUMN "trace_id" TEXT;

-- Backfill from the metadata that older rows already carry.
UPDATE "ai_usage_logs"
SET "trace_id" = "metadata" ->> 'traceId'
WHERE "metadata" ? 'traceId';

UPDATE "prompt_runs"
SET "trace_id" = "metadata" ->> 'traceId'
WHERE "metadata" ? 'traceId';

CREATE INDEX "ai_usage_logs_project_id_trace_id_idx" ON "ai_usage_logs"("project_id", "trace_id");
CREATE INDEX "prompt_runs_project_id_trace_id_idx" ON "prompt_runs"("project_id", "trace_id");

-- The monthly audit quota counts full_diagnosis jobs per organization; the
-- reservation transaction runs both of these on every audit start.
CREATE INDEX "analysis_jobs_project_id_job_type_created_at_idx" ON "analysis_jobs"("project_id", "job_type", "created_at");
CREATE INDEX "analysis_jobs_job_type_created_at_idx" ON "analysis_jobs"("job_type", "created_at");
