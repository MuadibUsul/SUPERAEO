CREATE TABLE "trace_events" (
    "id" TEXT NOT NULL,
    "trace_id" TEXT NOT NULL,
    "span_id" TEXT NOT NULL,
    "parent_span_id" TEXT,
    "severity" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "subsystem" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "status" TEXT,
    "message" TEXT,
    "error_code" TEXT,
    "error_message" TEXT,
    "duration_ms" INTEGER,
    "http_method" TEXT,
    "http_path" TEXT,
    "http_status" INTEGER,
    "user_id" TEXT,
    "organization_id" TEXT,
    "project_id" TEXT,
    "analysis_job_id" TEXT,
    "run_id" TEXT,
    "prompt_run_id" TEXT,
    "ai_usage_log_id" TEXT,
    "object_type" TEXT,
    "object_id" TEXT,
    "metadata_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trace_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "trace_events_trace_id_created_at_idx" ON "trace_events"("trace_id", "created_at");
CREATE INDEX "trace_events_severity_created_at_idx" ON "trace_events"("severity", "created_at");
CREATE INDEX "trace_events_project_id_created_at_idx" ON "trace_events"("project_id", "created_at");
CREATE INDEX "trace_events_operation_created_at_idx" ON "trace_events"("operation", "created_at");
CREATE INDEX "trace_events_analysis_job_id_created_at_idx" ON "trace_events"("analysis_job_id", "created_at");
