-- Add composite lookup index for the most common MetricSnapshot query pattern:
-- findFirst({ where: { projectId, subjectId }, orderBy: { createdAt: 'desc' } })
CREATE INDEX "metric_snapshots_project_id_subject_id_created_at_idx"
ON "metric_snapshots"("project_id", "subject_id", "created_at" DESC);
