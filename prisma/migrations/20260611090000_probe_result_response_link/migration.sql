-- Link normalized probe results back to the sampled AI response they describe.
ALTER TABLE "probe_results" ADD COLUMN "response_id" TEXT;

ALTER TABLE "probe_results"
ADD CONSTRAINT "probe_results_response_id_fkey"
FOREIGN KEY ("response_id") REFERENCES "ai_responses"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "probe_results_response_id_idx" ON "probe_results"("response_id");
CREATE UNIQUE INDEX "probe_results_response_id_probe_family_key" ON "probe_results"("response_id", "probe_family");
