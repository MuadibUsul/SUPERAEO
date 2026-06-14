# AI Answer Inclusion & Brand Semantic Universe Platform

## Accepted Scope

This repo implements the approved plan in sprints. The current implementation is Sprint 1 only: project setup, database schema, demo-user strategy, project creation, competitor management, and a dashboard shell.

## Sprint 1

- Scaffold a Next.js App Router application with TypeScript, Tailwind, and shadcn/ui.
- Add a PostgreSQL Prisma schema covering the MVP data model.
- Add an initial SQL migration and seed script.
- Use a lightweight demo user so auth can be added later without changing project ownership.
- Add project creation with brand, website/domain, industry, target market, language, and competitors.
- Add competitor management on the dashboard.
- Add empty workflow routes for keywords, queries, sampling runs, semantic universe, gaps, actions, reports, and retest comparison.

## Later Sprints

- Sprint 2: semantic keyword and query generators with strict JSON validation.
- Sprint 3: OpenAI sampling adapter, sampling runs, and stored raw answers.
- Sprint 4: answer extraction and metric snapshots.
- Sprint 5: Brand Semantic Universe graph.
- Sprint 6: inclusion gaps, action plan, and hallucination auditor v1.
- Sprint 7: report export and baseline/retest comparison.

## Guardrails

- Describe the product as an Observable AI Answer Space built from systematic sampling, co-occurrence, embeddings, citations, competitor comparison, and retest validation.
- Never claim access to hidden LLM weights, memory, or internal state.
- Store raw model responses and raw prompt outputs for auditability.
- Keep platform adapters modular and implement OpenAI first.
- Keep the MVP PostgreSQL-backed; do not introduce Neo4j, enterprise permissions, billing, or automatic publishing.
