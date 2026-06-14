# Cognition Intelligence Platform (CIP)

Bilingual official site, customer workspace, and operator console for cognition audits, AI answer observability, and entity intelligence workflows.

## Current Capabilities

- `/zh-CN` and `/en` official site with a focused Start Cognition Audit CTA.
- Email/password session auth with role separation.
- Customer app under `/:locale/app` for projects, competitors, semantic keywords, buyer queries, sampling runs, entity intelligence, semantic coverage, alerts, and reports.
- Operator console under `/:locale/admin` for users, organizations, projects, AI providers, models, prompt templates, routing rules, queue status, usage logs, and system health.
- PostgreSQL Prisma schema for customer data, admin operations, prompt runs, AI usage logs, stability, alerts, and coverage snapshots.
- Backend-configurable AI providers for OpenAI Responses, OpenAI-compatible APIs, Anthropic Messages, Gemini native, and Perplexity-style chat completions.
- Queue-ready sampling architecture with BullMQ/Redis hooks, plus optional Qdrant, Neo4j, object storage, and external cognitive analysis service adapters.
- Raw AI outputs and usage metadata are stored for auditability.

## Setup

```bash
npm install
cp .env.example .env
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
npm run worker
```

Open [http://localhost:3000](http://localhost:3000).

Validate the local stack after the dev server and worker are running:

```bash
npm run validate:local
```

Seed accounts:

- Operator: `operator@aeo.local` / `Operator@123456`
- Customer: `demo@observable-ai.local` / `Customer@123456`

Runbooks:

- Local validation: `docs/runbooks/local-validation.md`
- Deployment readiness: `docs/runbooks/deployment-readiness.md`

## Environment Variables

- `DATABASE_URL`: PostgreSQL connection string.
- `ENCRYPTION_KEY`: secret used to encrypt provider API keys.
- `APP_BASE_URL`: local or deployed base URL.
- `OPENAI_API_KEY` and `PERPLEXITY_API_KEY`: optional placeholders; provider keys are managed in the operator console.
- `REDIS_URL`: optional, enables BullMQ queues and the worker process.
- `QDRANT_URL`, `QDRANT_API_KEY`: optional semantic vector layer configuration.
- `NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD`: optional graph intelligence configuration.
- `OBJECT_STORAGE_ENDPOINT`, `OBJECT_STORAGE_REGION`, `OBJECT_STORAGE_ACCESS_KEY_ID`, `OBJECT_STORAGE_SECRET_ACCESS_KEY`, `OBJECT_STORAGE_BUCKET`: optional S3-compatible artifact storage.
- `COGNITIVE_SERVICE_URL`, `COGNITIVE_SERVICE_API_KEY`: optional external FastAPI cognitive analysis service.

## Product Boundary

The platform observes sampled AI answers. It does not claim access to hidden model weights, private memory, or internal model state.
