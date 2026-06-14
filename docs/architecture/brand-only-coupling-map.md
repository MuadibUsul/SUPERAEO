# Brand-only Coupling Map

This audit records the current coupling points that must be handled while moving CIP from a brand-only cognition product to an entity cognition platform.

## Reusable Foundations

- Auth, organization membership, role checks, and admin access are already product-grade enough to preserve.
- AI provider management, provider testing, routing rules, task execution policies, and the concurrency runner can be reused for all probe types.
- `runJsonPrompt` already provides strict JSON parsing, validation, one repair attempt, PromptRun persistence, and usage logging.
- BullMQ/Redis, object storage, Qdrant, and Neo4j adapters should remain infrastructure layers rather than entity-specific code.

## Brand-only Coupling Points

- `Project` stores `brandName`, `domain`, `industry`, and `targetMarket` directly. These remain compatibility fields, but new entity context should flow through `ProjectSubject`.
- `SemanticKeyword`, `AeoQuery`, `SamplingRun`, `PromptRun`, and `MetricSnapshot` were project-scoped only. They now need nullable `subjectId` for gradual subject-aware migration.
- `AnswerAnalysis` contains `brandMentioned`, `brandRecommended`, and `brandDescription`. These should be treated as legacy brand analysis fields until `ProbeResult` becomes the canonical normalized result.
- `CitationSource.supportsBrand` is brand-specific. Future result normalization should write entity-aware citation evidence to `ProbeResult.evidenceJson`.
- `semantic-keyword-generator.ts`, `query-generator.ts`, and `answer-extractor.ts` still use brand wording. They should be refactored after the ProjectSubject foundation lands.
- Workflow UI and i18n copy still reference brand/competitors in multiple places. These should be updated after entity-aware project creation exists.

## Minimal Safe Path

1. Add `ProjectSubject` and backfill one primary BRAND subject for every existing project.
2. Keep legacy Project fields and old pages working.
3. Write `subjectId` on new keyword, query, run, prompt, and metric records.
4. Add a subject service that can create, sync, and recover the primary subject.
5. Refactor prompt inputs and UI only after the compatibility layer is stable.

## High-risk Areas

- Prisma migrations must not delete or rename existing fields.
- Prompt schema changes can break strict JSON validation, so keep output shapes stable until entity-specific schemas are introduced.
- Run progress should not be moved to frontend estimates again; backend stage tracking should be introduced separately.
- Generated metrics must preserve existing dashboard behavior while subject-aware metrics are added.
