# CIP Local Validation Runbook

Last updated: 2026-05-21

## Goal

Use this runbook to confirm the local CIP stack is healthy enough for feature validation before deployment.

## Required Local Services

- PostgreSQL on port `5432`
- Redis on port `6379`
- Next.js dev server
- BullMQ worker

## Known Local Accounts

- Customer: `demo@observable-ai.local` / `Customer@123456`
- Operator: `operator@aeo.local` / `Operator@123456`
- Local test user: `localtest@aeo.local` / `LocalTest@123456`

## Start The Local Stack

Start Redis if it is not already running:

```powershell
Start-Process -FilePath "C:\ProgramData\chocolatey\lib\redis\tools\redis-server.exe" -ArgumentList "/cygdrive/f/CIP/redis/redis.conf" -WindowStyle Hidden
redis-cli ping
```

Start the app:

```powershell
npm run dev
```

Start the worker in another terminal:

```powershell
npm run worker
```

If the worker is not running, Start Diagnosis can still fall back to an in-process run in development when Redis is configured. The UI will show a delayed-processing state only when an enqueued job has no live worker.

## Validate The Stack

Run:

```powershell
npm run validate:local
```

The command checks:

- PostgreSQL connectivity
- seed account password validity
- Redis connectivity
- optional service configuration warnings
- public homepage HTTP availability
- customer login
- customer project page
- operator login
- operator admin page
- admin system health
- worker up/down and queue depth visibility in admin system health

Warnings for Qdrant, Neo4j, object storage, or cognitive service are acceptable for core local validation unless the feature being tested depends on them.

## Manual Smoke Checks

Open:

- `http://127.0.0.1:3000/zh-CN`
- `http://127.0.0.1:3000/zh-CN/login`
- `http://127.0.0.1:3000/zh-CN/app/projects`
- `http://127.0.0.1:3000/zh-CN/admin`

Verify:

- homepage is not blank
- customer login reaches the project list
- operator login reaches admin
- admin system health shows database and Redis as healthy

## Representative Queue Check

Use an existing project that already has at least one sampling run.

Trigger a semantic nebula build from the UI or API, then verify:

- an `AnalysisJob` is created
- `redisQueued` is true
- worker moves the job from queued to running
- job completes
- stage history is written

## Troubleshooting

If login fails:

- run `npm run validate:local`
- confirm seed users exist and passwords validate
- check the dev server logs for `/api/auth/login`

If queue jobs do not run:

- confirm `REDIS_URL` exists in `.env`
- run `redis-cli ping`
- confirm `npm run worker` prints both worker ready messages
- open Operator Admin -> System Health and verify the Worker row is Up with a fresh heartbeat

If Prisma import fails:

- run `npm run db:generate`
- remember this project generates Prisma client into `src/generated/prisma`, not the default `@prisma/client` runtime path
