# CIP System State Snapshot

Captured at: 2026-05-21 13:23 (Asia/Shanghai)

## Purpose

This document freezes the current local state of the CIP codebase and runtime environment so future refactors can compare against a concrete baseline.

## Executive Summary

- The project is running locally on Next.js 16.2.6 with App Router, PostgreSQL, Prisma, Redis, and BullMQ worker support.
- Customer login, operator login, Redis queue health, and a representative semantic nebula background job have all been verified locally.
- The current codebase contains both the newer localized route tree under `src/app/[locale]` and an older legacy route tree under `src/app/(app)`.
- Core semantic intelligence layers are present:
  - Semantic Nebula
  - Long-tail Opportunities
  - Question Territory
  - Full diagnosis orchestration
  - Brand probe backend scaffolding
  - TraceEvent observability
- The local environment is operational for front-end validation and core async workflow validation.
- Optional infrastructure remains unconfigured in local:
  - Qdrant
  - Neo4j
  - external cognitive service
  - object storage

## Codebase Shape

### App structure

- App route files (`page.tsx`): 50
- API route handlers (`route.ts`): 48
- Component files under `src/components`: 44
- Server-side files under `src/server`: 88

### Route trees

The repository currently contains two parallel application route structures:

1. Current localized app:
   - `src/app/[locale]`
   - customer app under `src/app/[locale]/app`
   - operator admin under `src/app/[locale]/admin`

2. Legacy app tree still present:
   - `src/app/(app)`

This is a meaningful architectural signal: the product has moved toward a localized production route system, but older route surfaces still exist in the repo and should be treated as technical debt until fully retired or redirected.

### Major component domains

Top-level component domains currently present:

- `admin`
- `auth`
- `dashboard`
- `diagnosis`
- `layout`
- `marketing`
- `project`
- `semantic-intelligence`
- `ui`
- `workflow`

### Major server domains

Top-level server domains currently present:

- `ai`
- `analysis`
- `audit`
- `auth`
- `brand-probes`
- `data`
- `diagnosis`
- `external`
- `jobs`
- `metrics`
- `observability`
- `opportunity`
- `orchestration`
- `probe`
- `projects`
- `queue`
- `sampling`
- `security`
- `semantic-nebula`
- `utils`
- `validation`
- `workflow`

## Local Runtime Status

### Verified local services

- PostgreSQL port `5432`: reachable
- Redis port `6379`: reachable
- Redis ping: `PONG`
- Next.js dev server: running
- BullMQ worker: running and reported ready

### Local environment configuration

Current local environment includes:

- `DATABASE_URL=postgresql://cip_local:cip_local_pass@localhost:5432/aeo_local?schema=public`
- `REDIS_URL=redis://127.0.0.1:6379`

Redis binaries are installed under Chocolatey, while Redis data and logs are now configured under:

- `F:\CIP\redis`

### Admin health snapshot

Authenticated `/api/admin/system/health` result at capture time:

- database: ok
- queue / Redis: ok
- qdrant: not configured
- neo4j: not configured
- cognitive service: not configured
- object storage: not configured

## Database Snapshot

### Primary entity counts

- users: 3
- organizations: 3
- projects: 2
- sessions: 13
- analysis jobs: 12
- trace events: 127
- sampling runs: 1
- semantic nebula snapshots: 24
- reports: 1

### Additional workflow counts

- prompt runs: 51
- AI usage logs: 86
- brand probe runs: 0
- brand probe responses: 0
- extracted signals: 0

### Analysis job status distribution

- completed: 11
- failed: 1

### Analysis job type distribution

- `semantic_nebula_build`: 3
- `full_diagnosis`: 2
- `long_tail_opportunity_generation`: 2
- `question_territory_build`: 5

## Verified Accounts

The following accounts were validated as usable in local:

- Operator:
  - `operator@aeo.local`
  - `Operator@123456`
- Customer:
  - `demo@observable-ai.local`
  - `Customer@123456`
- Additional local test account created and verified:
  - `localtest@aeo.local`
  - `LocalTest@123456`

## Verified User Flows

### Customer-facing

Verified:

- login page loads
- customer login succeeds
- redirect lands on `/:locale/app/projects`
- customer project index renders correctly

### Operator-facing

Verified:

- login page loads
- operator login succeeds
- redirect lands on `/:locale/admin`
- admin console renders correctly
- authenticated system health endpoint returns expected service status

### Async workflow

Verified:

- Redis-backed queue accepted a `semantic_nebula_build` job
- BullMQ worker picked up the job
- `AnalysisJob` stage history updated during execution
- job completed successfully and persisted resulting snapshot IDs

This means the local stack is not only “booting”, but can execute at least one real semantic intelligence background workflow end to end.

## Current Product State

### Public website

Current public site has already been shifted toward a single-screen semantic nebula-first landing experience with a strong CTA orientation.

State at snapshot time:

- homepage is minimal and focused
- start flow exists at `/:locale/start`
- localized public marketing routes exist:
  - `/[locale]`
  - `/[locale]/start`
  - `/[locale]/product`
  - `/[locale]/use-cases`

### Customer app

Current customer app direction is moving away from raw workflow plumbing toward a diagnosis product surface.

Observed structural state:

- project list exists
- new project wizard exists
- per-project app areas exist for:
  - dashboard
  - semantic nebula
  - opportunities
  - question territory
  - reports
  - evidence
  - settings
- advanced and older workflow surfaces still exist in the broader codebase

### Operator admin

Operator admin is substantial and operational.

Observed sections include:

- users
- organizations
- projects
- AI providers
- models
- prompt templates
- routing
- queues
- usage
- audit logs
- trace logs
- system health

## Architecture Signals

### Strong areas

- Localized route structure is in place.
- Auth, session, and role separation are functioning.
- Prisma schema is broad and already models the major CIP product domains.
- Queue, worker, and observability layers are present rather than mocked.
- Semantic intelligence product areas are wired into both backend and UI surfaces.
- Trace logging has already been introduced as a first-class operational layer.

### Incomplete or transitional areas

- Legacy route tree `src/app/(app)` still coexists with the newer localized app.
- Brand probe schema and services exist, but local database usage is still effectively zero for that subsystem.
- Optional infra-backed intelligence services are not configured locally.
- Some UX modernization work is present, but the whole product is still in an in-between state between “powerful backend system” and “fully coherent premium product surface”.

## Working Tree Snapshot

Git branch at capture time:

- `master`

Working tree state at a high level:

- tracked modifications exist in root config and app shell files
- a large amount of application structure is currently untracked in git
- docs, prisma, scripts, app routes, components, i18n, lib, and server directories are all part of the current untracked/dirty local state

This means the repository is currently in an active build state rather than a clean tagged baseline.

## Key Risks At Snapshot Time

1. Route duplication risk
   - The presence of both `src/app/(app)` and `src/app/[locale]` increases maintenance cost and can confuse future refactors.

2. Feature completion asymmetry
   - Semantic Nebula, Opportunities, and Territory are present, but not all surrounding product experiences are equally refined.

3. Local vs deploy parity
   - Local queue flow is healthy, but optional production-adjacent services are still unconfigured.

4. Git baseline ambiguity
   - The repo is not in a clean state, so future diffs should reference this snapshot document rather than assuming a pristine source baseline.

## Recommended Use Of This Snapshot

Use this document as the baseline for:

- UX consolidation work
- route tree cleanup
- semantic intelligence product hardening
- brand probe execution rollout
- local-to-staging deployment readiness review

## Reference Files

- Prior audit: [project-snapshot-architecture-experience-audit-2026-05-21.md](E:/Codes/AEO/docs/project-snapshot-architecture-experience-audit-2026-05-21.md)
- Current snapshot: this document
