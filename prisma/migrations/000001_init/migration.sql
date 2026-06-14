-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "KeywordType" AS ENUM ('category', 'scenario', 'attribute', 'intent', 'competitor', 'risk');

-- CreateEnum
CREATE TYPE "QueryType" AS ENUM ('recommendation', 'comparison', 'alternative', 'pricing', 'use_case', 'risk', 'buyer_decision', 'education', 'best_tools', 'implementation');

-- CreateEnum
CREATE TYPE "RunType" AS ENUM ('baseline', 'retest');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('draft', 'queued', 'running', 'completed', 'failed', 'partially_failed');

-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('openai', 'openai_compatible', 'anthropic', 'gemini', 'perplexity');

-- CreateEnum
CREATE TYPE "EntityType" AS ENUM ('brand', 'competitor', 'product', 'source', 'concept');

-- CreateEnum
CREATE TYPE "MentionType" AS ENUM ('mentioned', 'recommended', 'cited', 'compared');

-- CreateEnum
CREATE TYPE "Sentiment" AS ENUM ('positive', 'neutral', 'negative', 'mixed', 'unknown');

-- CreateEnum
CREATE TYPE "EdgeType" AS ENUM ('co_occurs', 'semantically_close', 'cited_by', 'competes_with', 'risk_association');

-- CreateEnum
CREATE TYPE "GapType" AS ENUM ('semantic', 'entity', 'citation', 'content', 'technical', 'authority');

-- CreateEnum
CREATE TYPE "GapSeverity" AS ENUM ('low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "ActionType" AS ENUM ('content', 'schema', 'citation', 'entity', 'technical', 'messaging');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('P1', 'P2', 'P3');

-- CreateEnum
CREATE TYPE "ActionStatus" AS ENUM ('open', 'in_progress', 'done', 'dismissed');

-- CreateEnum
CREATE TYPE "PromptStatus" AS ENUM ('success', 'repaired', 'failed');

-- CreateEnum
CREATE TYPE "ReportFormat" AS ENUM ('html', 'pdf');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('draft', 'ready', 'failed');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('platform_owner', 'operator_admin', 'operator_viewer', 'customer_owner', 'customer_member', 'customer_viewer');

-- CreateEnum
CREATE TYPE "OrganizationType" AS ENUM ('internal', 'customer');

-- CreateEnum
CREATE TYPE "AIProviderType" AS ENUM ('openai_responses', 'openai_compatible', 'anthropic_messages', 'gemini_native', 'perplexity_sonar');

-- CreateEnum
CREATE TYPE "AIUsageStatus" AS ENUM ('success', 'failed');

-- CreateEnum
CREATE TYPE "PromptTemplateStatus" AS ENUM ('active', 'inactive');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "password_hash" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'customer_owner',
    "preferred_locale" TEXT NOT NULL DEFAULT 'zh-CN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "type" "OrganizationType" NOT NULL DEFAULT 'customer',
    "default_locale" TEXT NOT NULL DEFAULT 'zh-CN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_members" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'customer_owner',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "organization_id" TEXT,
    "name" TEXT NOT NULL,
    "brand_name" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "industry" TEXT NOT NULL,
    "target_market" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competitors" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT,
    "category" TEXT NOT NULL DEFAULT 'direct',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "competitors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "semantic_keywords" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "keyword_type" "KeywordType" NOT NULL,
    "target_weight" DOUBLE PRECISION NOT NULL,
    "reason" TEXT,
    "confidence" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "semantic_keywords_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "queries" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "query_text" TEXT NOT NULL,
    "query_type" "QueryType" NOT NULL,
    "persona" TEXT,
    "intent" TEXT,
    "target_keyword_id" TEXT,
    "confidence" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "queries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sampling_runs" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "run_type" "RunType" NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'draft',
    "platforms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sample_count" INTEGER NOT NULL DEFAULT 0,
    "sample_count_per_query" INTEGER NOT NULL DEFAULT 1,
    "selected_query_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sampling_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_responses" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "query_id" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "model" TEXT NOT NULL,
    "raw_response" TEXT NOT NULL,
    "normalized_answer" TEXT,
    "citations" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "answer_analyses" (
    "id" TEXT NOT NULL,
    "response_id" TEXT NOT NULL,
    "brand_mentioned" BOOLEAN NOT NULL DEFAULT false,
    "brand_recommended" BOOLEAN NOT NULL DEFAULT false,
    "brand_position" INTEGER,
    "brand_description" TEXT,
    "competitors_mentioned" JSONB,
    "recommendation_winner" TEXT,
    "mention_context" TEXT,
    "sentiment" "Sentiment" NOT NULL DEFAULT 'unknown',
    "matched_keywords" JSONB,
    "citations_used" JSONB,
    "possible_hallucinations" JSONB,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "raw_analysis" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "answer_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entity_mentions" (
    "id" TEXT NOT NULL,
    "response_id" TEXT NOT NULL,
    "entity_name" TEXT NOT NULL,
    "entity_type" "EntityType" NOT NULL,
    "mention_type" "MentionType" NOT NULL,
    "position" INTEGER,
    "sentiment" "Sentiment" NOT NULL DEFAULT 'unknown',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "context" TEXT,

    CONSTRAINT "entity_mentions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "semantic_edges" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "source_node" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "target_node" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "edge_type" "EdgeType" NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "evidence" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "semantic_edges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inclusion_gaps" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "gap_type" "GapType" NOT NULL,
    "severity" "GapSeverity" NOT NULL,
    "target_keyword" TEXT,
    "reason" TEXT NOT NULL,
    "evidence" JSONB,
    "competitor_advantage" TEXT,
    "suggested_action" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inclusion_gaps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "action_items" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "gap_id" TEXT,
    "action_type" "ActionType" NOT NULL,
    "priority" "Priority" NOT NULL,
    "target_keyword" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "why_this_matters" TEXT,
    "recommended_asset" TEXT,
    "implementation_notes" TEXT,
    "expected_impact" TEXT,
    "retest_queries" JSONB,
    "success_metric" TEXT,
    "evidence" JSONB,
    "status" "ActionStatus" NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "action_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "run_id" TEXT,
    "title" TEXT NOT NULL,
    "format" "ReportFormat" NOT NULL DEFAULT 'html',
    "status" "ReportStatus" NOT NULL DEFAULT 'draft',
    "snapshot" JSONB,
    "html" TEXT,
    "file_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prompt_runs" (
    "id" TEXT NOT NULL,
    "project_id" TEXT,
    "provider_id" TEXT,
    "prompt_name" TEXT NOT NULL,
    "prompt_version" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "raw_output" TEXT,
    "parsed_output" JSONB,
    "status" "PromptStatus" NOT NULL,
    "error" TEXT,
    "repair_attempted" BOOLEAN NOT NULL DEFAULT false,
    "usage" JSONB,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prompt_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metric_snapshots" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "sample_count" INTEGER NOT NULL,
    "ai_answer_inclusion_score" DOUBLE PRECISION NOT NULL,
    "mention_rate" DOUBLE PRECISION NOT NULL,
    "recommendation_share" DOUBLE PRECISION NOT NULL,
    "citation_rate" DOUBLE PRECISION NOT NULL,
    "semantic_universe_strength" DOUBLE PRECISION NOT NULL,
    "stability_score" DOUBLE PRECISION NOT NULL,
    "description_accuracy" DOUBLE PRECISION NOT NULL,
    "competitor_gap" DOUBLE PRECISION,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "metric_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_providers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider_type" "AIProviderType" NOT NULL,
    "base_url" TEXT,
    "api_key_encrypted" TEXT,
    "default_model" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "supports_json_schema" BOOLEAN NOT NULL DEFAULT false,
    "supports_citations" BOOLEAN NOT NULL DEFAULT false,
    "supports_web_search" BOOLEAN NOT NULL DEFAULT false,
    "supports_embeddings" BOOLEAN NOT NULL DEFAULT false,
    "rate_limit_per_minute" INTEGER,
    "monthly_budget" DOUBLE PRECISION,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_models" (
    "id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "display_name" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "supports_json_schema" BOOLEAN NOT NULL DEFAULT false,
    "supports_citations" BOOLEAN NOT NULL DEFAULT false,
    "supports_web_search" BOOLEAN NOT NULL DEFAULT false,
    "supports_embeddings" BOOLEAN NOT NULL DEFAULT false,
    "default_for_tasks" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage_logs" (
    "id" TEXT NOT NULL,
    "provider_id" TEXT,
    "model_id" TEXT,
    "project_id" TEXT,
    "organization_id" TEXT,
    "user_id" TEXT,
    "operation" TEXT NOT NULL,
    "status" "AIUsageStatus" NOT NULL,
    "prompt_tokens" INTEGER,
    "completion_tokens" INTEGER,
    "total_tokens" INTEGER,
    "latency_ms" INTEGER,
    "cost_usd" DOUBLE PRECISION,
    "error" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prompt_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "task" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "content" TEXT NOT NULL,
    "output_schema" JSONB,
    "status" "PromptTemplateStatus" NOT NULL DEFAULT 'active',
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prompt_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "organization_id" TEXT,
    "action" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locale_preferences" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "organization_id" TEXT,
    "locale" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "locale_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "organization_members_user_id_idx" ON "organization_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "organization_members_organization_id_user_id_key" ON "organization_members"("organization_id", "user_id");

-- CreateIndex
CREATE INDEX "projects_user_id_idx" ON "projects"("user_id");

-- CreateIndex
CREATE INDEX "projects_organization_id_idx" ON "projects"("organization_id");

-- CreateIndex
CREATE INDEX "competitors_project_id_idx" ON "competitors"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "competitors_project_id_name_key" ON "competitors"("project_id", "name");

-- CreateIndex
CREATE INDEX "semantic_keywords_project_id_keyword_type_idx" ON "semantic_keywords"("project_id", "keyword_type");

-- CreateIndex
CREATE UNIQUE INDEX "semantic_keywords_project_id_keyword_key" ON "semantic_keywords"("project_id", "keyword");

-- CreateIndex
CREATE INDEX "queries_project_id_query_type_idx" ON "queries"("project_id", "query_type");

-- CreateIndex
CREATE INDEX "queries_target_keyword_id_idx" ON "queries"("target_keyword_id");

-- CreateIndex
CREATE INDEX "sampling_runs_project_id_run_type_status_idx" ON "sampling_runs"("project_id", "run_type", "status");

-- CreateIndex
CREATE INDEX "ai_responses_run_id_idx" ON "ai_responses"("run_id");

-- CreateIndex
CREATE INDEX "ai_responses_query_id_idx" ON "ai_responses"("query_id");

-- CreateIndex
CREATE UNIQUE INDEX "answer_analyses_response_id_key" ON "answer_analyses"("response_id");

-- CreateIndex
CREATE INDEX "entity_mentions_response_id_idx" ON "entity_mentions"("response_id");

-- CreateIndex
CREATE INDEX "entity_mentions_entity_name_idx" ON "entity_mentions"("entity_name");

-- CreateIndex
CREATE INDEX "semantic_edges_project_id_edge_type_idx" ON "semantic_edges"("project_id", "edge_type");

-- CreateIndex
CREATE INDEX "inclusion_gaps_project_id_gap_type_severity_idx" ON "inclusion_gaps"("project_id", "gap_type", "severity");

-- CreateIndex
CREATE INDEX "action_items_project_id_priority_status_idx" ON "action_items"("project_id", "priority", "status");

-- CreateIndex
CREATE INDEX "reports_project_id_run_id_idx" ON "reports"("project_id", "run_id");

-- CreateIndex
CREATE INDEX "prompt_runs_project_id_prompt_name_idx" ON "prompt_runs"("project_id", "prompt_name");

-- CreateIndex
CREATE INDEX "prompt_runs_provider_id_idx" ON "prompt_runs"("provider_id");

-- CreateIndex
CREATE INDEX "metric_snapshots_project_id_run_id_idx" ON "metric_snapshots"("project_id", "run_id");

-- CreateIndex
CREATE INDEX "ai_providers_provider_type_enabled_idx" ON "ai_providers"("provider_type", "enabled");

-- CreateIndex
CREATE INDEX "ai_models_provider_id_enabled_idx" ON "ai_models"("provider_id", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "ai_models_provider_id_name_key" ON "ai_models"("provider_id", "name");

-- CreateIndex
CREATE INDEX "ai_usage_logs_provider_id_created_at_idx" ON "ai_usage_logs"("provider_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_usage_logs_project_id_created_at_idx" ON "ai_usage_logs"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_usage_logs_organization_id_created_at_idx" ON "ai_usage_logs"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "prompt_templates_task_status_idx" ON "prompt_templates"("task", "status");

-- CreateIndex
CREATE UNIQUE INDEX "prompt_templates_name_version_locale_key" ON "prompt_templates"("name", "version", "locale");

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_created_at_idx" ON "audit_logs"("actor_user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_organization_id_created_at_idx" ON "audit_logs"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "locale_preferences_user_id_idx" ON "locale_preferences"("user_id");

-- CreateIndex
CREATE INDEX "locale_preferences_organization_id_idx" ON "locale_preferences"("organization_id");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitors" ADD CONSTRAINT "competitors_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "semantic_keywords" ADD CONSTRAINT "semantic_keywords_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queries" ADD CONSTRAINT "queries_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queries" ADD CONSTRAINT "queries_target_keyword_id_fkey" FOREIGN KEY ("target_keyword_id") REFERENCES "semantic_keywords"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sampling_runs" ADD CONSTRAINT "sampling_runs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_responses" ADD CONSTRAINT "ai_responses_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "sampling_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_responses" ADD CONSTRAINT "ai_responses_query_id_fkey" FOREIGN KEY ("query_id") REFERENCES "queries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answer_analyses" ADD CONSTRAINT "answer_analyses_response_id_fkey" FOREIGN KEY ("response_id") REFERENCES "ai_responses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_mentions" ADD CONSTRAINT "entity_mentions_response_id_fkey" FOREIGN KEY ("response_id") REFERENCES "ai_responses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "semantic_edges" ADD CONSTRAINT "semantic_edges_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inclusion_gaps" ADD CONSTRAINT "inclusion_gaps_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_items" ADD CONSTRAINT "action_items_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_items" ADD CONSTRAINT "action_items_gap_id_fkey" FOREIGN KEY ("gap_id") REFERENCES "inclusion_gaps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "sampling_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prompt_runs" ADD CONSTRAINT "prompt_runs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prompt_runs" ADD CONSTRAINT "prompt_runs_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "ai_providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_snapshots" ADD CONSTRAINT "metric_snapshots_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_snapshots" ADD CONSTRAINT "metric_snapshots_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "sampling_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_providers" ADD CONSTRAINT "ai_providers_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_models" ADD CONSTRAINT "ai_models_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "ai_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "ai_providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "ai_models"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prompt_templates" ADD CONSTRAINT "prompt_templates_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locale_preferences" ADD CONSTRAINT "locale_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locale_preferences" ADD CONSTRAINT "locale_preferences_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
