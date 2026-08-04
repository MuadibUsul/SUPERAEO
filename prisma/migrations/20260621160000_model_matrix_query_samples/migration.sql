-- Add a model dimension to query sample state so a single run can sample the
-- same query across multiple providers/models without colliding on sampleIndex.
ALTER TABLE "query_samples"
  ADD COLUMN "model_key" TEXT NOT NULL DEFAULT 'default',
  ADD COLUMN "provider_id" TEXT,
  ADD COLUMN "model_id" TEXT,
  ADD COLUMN "model" TEXT;

ALTER TABLE "query_samples"
  DROP CONSTRAINT IF EXISTS "query_samples_run_id_query_id_sample_index_key";

ALTER TABLE "query_samples"
  ADD CONSTRAINT "query_samples_run_id_query_id_model_key_sample_index_key"
  UNIQUE ("run_id", "query_id", "model_key", "sample_index");

CREATE INDEX "query_samples_provider_id_model_id_idx"
  ON "query_samples"("provider_id", "model_id");

ALTER TABLE "experiment_results"
  ADD COLUMN "metadata" JSONB;
