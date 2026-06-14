# CIP Deployment Readiness Runbook

Last updated: 2026-05-21

## Goal

Use this checklist before deploying CIP outside local development.

## Required Readiness Gates

### Code Health

Run:

```powershell
npm run lint
npx tsc --noEmit
npm test
```

All three should pass before deployment.

### Database

Confirm:

- `DATABASE_URL` points to the intended deployment database
- Prisma migrations are up to date
- Prisma client generation succeeds
- seed/demo accounts are not used as production credentials

Commands:

```powershell
npx prisma validate
npx prisma migrate status
npm run db:generate
```

### Queue

Confirm:

- `REDIS_URL` is configured
- worker process is deployed separately from the web process
- queue health endpoint reports Redis reachable
- failed jobs can be inspected in Operator Admin

Production should not rely on local background execution for long-running diagnosis work.

### AI Providers

Confirm in Operator Admin:

- at least one provider is enabled
- at least one model supports structured JSON generation
- provider routing rules exist for core diagnosis tasks
- usage logs are being written
- failed provider calls surface a traceId

### Auth And Roles

Confirm:

- customer user can access only customer routes
- operator user can access admin routes
- non-operator user receives 403 for admin APIs
- session cookies are secure in production

### Observability

Confirm:

- `TraceEvent` writes successfully
- API errors return `traceId`
- queue jobs record stage history
- PromptRun and AIUsageLog are populated for AI calls

### Optional Services

Decide explicitly whether these are enabled for the deployment:

- Qdrant
- Neo4j
- S3-compatible object storage
- external cognitive service

If disabled, product surfaces should not imply those capabilities are active.

## Product Smoke

Verify:

- public homepage loads and the Semantic Nebula visual is visible
- signup/login works
- new project wizard works for all supported entity types
- Start Diagnosis creates a real job
- diagnosis status survives refresh
- completed report renders
- Semantic Nebula, Opportunities, Territory, Report, and Evidence pages render without raw internal objects in the default customer view

## Operator Smoke

Verify:

- admin overview loads
- system health loads
- queues page shows recent jobs
- trace logs can be filtered by traceId
- provider/routing pages are usable
- usage logs show AI calls by task/provider/model

## Release Notes Template

Record:

- migration IDs applied
- changed environment variables
- queue/worker changes
- provider/routing changes
- known disabled optional services
- rollback notes

## Current Known Gaps

As of the latest local snapshot:

- Qdrant, Neo4j, object storage, and external cognitive service are not configured locally.
- `src/app/(app)` legacy routes still exist and should not receive new features.
- Brand probe backend exists, but local probe run counts are still zero.
