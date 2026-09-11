CREATE TYPE "EvidenceClaimType" AS ENUM ('OBSERVATION', 'INFERENCE', 'EXTERNAL_FACT', 'EXPERIMENT');
CREATE TYPE "EvidenceSupportStatus" AS ENUM ('SUPPORTED', 'MIXED', 'UNSUPPORTED', 'INSUFFICIENT', 'LEGACY_INCOMPLETE');
CREATE TYPE "EvidenceGrade" AS ENUM ('INSUFFICIENT', 'DIRECTIONAL', 'CORROBORATED', 'CONFIRMATORY');
CREATE TYPE "EvidenceLinkRelation" AS ENUM ('SUPPORTS', 'OPPOSES', 'UNCERTAIN', 'EXCLUDED');
CREATE TYPE "SourceVerificationStatus" AS ENUM ('PENDING', 'VERIFIED_REACHABLE', 'SNAPSHOT_CREATED', 'UNREACHABLE', 'BLOCKED_BY_ROBOTS', 'LOGIN_REQUIRED', 'UNSAFE_URL', 'FETCH_FAILED', 'CONTENT_CHANGED');
CREATE TYPE "EvidenceSourceClass" AS ENUM ('SUBJECT_OFFICIAL', 'GOVERNMENT_STANDARD', 'ACADEMIC', 'PROFESSIONAL_MEDIA', 'COMMERCIAL', 'COMMUNITY', 'UNKNOWN');

ALTER TABLE "ai_responses"
  ADD COLUMN "system_prompt" TEXT,
  ADD COLUMN "user_prompt" TEXT,
  ADD COLUMN "request_params" JSONB,
  ADD COLUMN "provider_request_id" TEXT,
  ADD COLUMN "request_started_at" TIMESTAMP(3),
  ADD COLUMN "request_completed_at" TIMESTAMP(3),
  ADD COLUMN "response_hash" TEXT,
  ADD COLUMN "sampling_config" JSONB,
  ADD COLUMN "evidence_status" "EvidenceSupportStatus" NOT NULL DEFAULT 'LEGACY_INCOMPLETE';

ALTER TABLE "projects" ADD COLUMN "deleted_at" TIMESTAMP(3);
CREATE INDEX "projects_deleted_at_idx" ON "projects"("deleted_at");

ALTER TABLE "cognition_experiments"
  ADD COLUMN "assignment_seed" TEXT NOT NULL DEFAULT 'legacy',
  ADD COLUMN "preregistered" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "protocol" JSONB NOT NULL DEFAULT '{"version":"legacy","limitations":["Protocol was not frozen at creation"]}'::jsonb;

ALTER TABLE "experiment_results"
  ADD COLUMN "confidence_lower" DOUBLE PRECISION,
  ADD COLUMN "confidence_upper" DOUBLE PRECISION,
  ADD COLUMN "evidence_grade" "EvidenceGrade" NOT NULL DEFAULT 'DIRECTIONAL';

CREATE TABLE "evidence_claims" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "report_id" TEXT,
  "run_id" TEXT,
  "claim_type" "EvidenceClaimType" NOT NULL,
  "support_status" "EvidenceSupportStatus" NOT NULL DEFAULT 'INSUFFICIENT',
  "evidence_grade" "EvidenceGrade" NOT NULL DEFAULT 'INSUFFICIENT',
  "statement" TEXT NOT NULL,
  "machine_assessed" BOOLEAN NOT NULL DEFAULT true,
  "method_version" TEXT NOT NULL,
  "supporting_count" INTEGER NOT NULL DEFAULT 0,
  "opposing_count" INTEGER NOT NULL DEFAULT 0,
  "uncertain_count" INTEGER NOT NULL DEFAULT 0,
  "excluded_count" INTEGER NOT NULL DEFAULT 0,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "evidence_claims_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "source_snapshots" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "citation_source_id" TEXT,
  "object_artifact_id" TEXT,
  "normalized_url" TEXT NOT NULL,
  "fetched_at" TIMESTAMP(3),
  "http_status" INTEGER,
  "title" TEXT,
  "excerpt" TEXT,
  "content_hash" TEXT,
  "verification_status" "SourceVerificationStatus" NOT NULL DEFAULT 'PENDING',
  "source_class" "EvidenceSourceClass" NOT NULL DEFAULT 'UNKNOWN',
  "class_overridden_by" TEXT,
  "class_override_reason" TEXT,
  "class_overridden_at" TIMESTAMP(3),
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "source_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "evidence_links" (
  "id" TEXT NOT NULL,
  "claim_id" TEXT NOT NULL,
  "response_id" TEXT,
  "citation_source_id" TEXT,
  "source_snapshot_id" TEXT,
  "experiment_result_id" TEXT,
  "relation" "EvidenceLinkRelation" NOT NULL,
  "excerpt" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "evidence_links_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "evidence_manifests" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "report_id" TEXT NOT NULL,
  "canonical_json" JSONB NOT NULL,
  "content_hash" TEXT NOT NULL,
  "signature" TEXT NOT NULL,
  "key_id" TEXT NOT NULL,
  "method_version" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "evidence_manifests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "report_shares" (
  "id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "report_id" TEXT NOT NULL,
  "manifest_id" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "revoked_at" TIMESTAMP(3),
  "access_count" INTEGER NOT NULL DEFAULT 0,
  "last_accessed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "report_shares_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "evidence_claims_project_id_claim_type_evidence_grade_created_idx" ON "evidence_claims"("project_id", "claim_type", "evidence_grade", "created_at");
CREATE INDEX "evidence_claims_report_id_idx" ON "evidence_claims"("report_id");
CREATE INDEX "evidence_claims_run_id_idx" ON "evidence_claims"("run_id");
CREATE INDEX "source_snapshots_project_id_verification_status_source_clas_idx" ON "source_snapshots"("project_id", "verification_status", "source_class");
CREATE INDEX "source_snapshots_citation_source_id_created_at_idx" ON "source_snapshots"("citation_source_id", "created_at");
CREATE INDEX "evidence_links_claim_id_relation_idx" ON "evidence_links"("claim_id", "relation");
CREATE INDEX "evidence_links_response_id_idx" ON "evidence_links"("response_id");
CREATE INDEX "evidence_links_source_snapshot_id_idx" ON "evidence_links"("source_snapshot_id");
CREATE UNIQUE INDEX "evidence_manifests_report_id_key" ON "evidence_manifests"("report_id");
CREATE INDEX "evidence_manifests_project_id_created_at_idx" ON "evidence_manifests"("project_id", "created_at");
CREATE UNIQUE INDEX "report_shares_token_hash_key" ON "report_shares"("token_hash");
CREATE INDEX "report_shares_project_id_report_id_created_at_idx" ON "report_shares"("project_id", "report_id", "created_at");
CREATE INDEX "report_shares_expires_at_revoked_at_idx" ON "report_shares"("expires_at", "revoked_at");

ALTER TABLE "evidence_claims" ADD CONSTRAINT "evidence_claims_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "evidence_claims" ADD CONSTRAINT "evidence_claims_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "evidence_claims" ADD CONSTRAINT "evidence_claims_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "sampling_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "source_snapshots" ADD CONSTRAINT "source_snapshots_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "source_snapshots" ADD CONSTRAINT "source_snapshots_citation_source_id_fkey" FOREIGN KEY ("citation_source_id") REFERENCES "citation_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "source_snapshots" ADD CONSTRAINT "source_snapshots_object_artifact_id_fkey" FOREIGN KEY ("object_artifact_id") REFERENCES "object_artifacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "evidence_links" ADD CONSTRAINT "evidence_links_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "evidence_claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "evidence_links" ADD CONSTRAINT "evidence_links_response_id_fkey" FOREIGN KEY ("response_id") REFERENCES "ai_responses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "evidence_links" ADD CONSTRAINT "evidence_links_citation_source_id_fkey" FOREIGN KEY ("citation_source_id") REFERENCES "citation_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "evidence_links" ADD CONSTRAINT "evidence_links_source_snapshot_id_fkey" FOREIGN KEY ("source_snapshot_id") REFERENCES "source_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "evidence_links" ADD CONSTRAINT "evidence_links_experiment_result_id_fkey" FOREIGN KEY ("experiment_result_id") REFERENCES "experiment_results"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "evidence_manifests" ADD CONSTRAINT "evidence_manifests_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "evidence_manifests" ADD CONSTRAINT "evidence_manifests_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "report_shares" ADD CONSTRAINT "report_shares_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "report_shares" ADD CONSTRAINT "report_shares_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "report_shares" ADD CONSTRAINT "report_shares_manifest_id_fkey" FOREIGN KEY ("manifest_id") REFERENCES "evidence_manifests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
