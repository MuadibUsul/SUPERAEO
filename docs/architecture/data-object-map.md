# CIP Data Object Map

Last updated: 2026-05-21

## Purpose

CIP now has several AI response, probe, snapshot, and trace objects. This map defines the intended ownership boundaries so future work does not mix concepts or duplicate storage paths.

## Core Customer Objects

### Project

The customer-owned audit workspace.

Current compatibility fields such as `brandName`, `industry`, and `targetMarket` remain, but new product language should be driven by `ProjectSubject` when possible.

### ProjectSubject

The entity being diagnosed.

Supported entity types:

- `BRAND`
- `PERSON`
- `WEBSITE`
- `PRODUCT`

New customer-facing features should prefer subject-aware language over brand-only language.

## Sampling And Answer Objects

### SemanticKeyword

Generated semantic seed terms used to build the question map. These are not final insights; they are inputs to sampling and diagnosis.

### AeoQuery

Natural-language questions used to probe observable AI answer space.

### SamplingRun

A grouped execution of sampled AI questions.

### AIResponse

Raw AI answer captured during a sampling run.

Use this for:

- original answer text
- provider/model provenance
- citation data
- sample-level evidence

### AnswerAnalysis

Structured analysis derived from an `AIResponse`.

Use this for:

- target mention and recommendation
- competitor mentions
- sentiment
- matched keywords
- possible hallucinations

## Prompt And Usage Objects

### PromptRun

Every structured AI generation call that goes through the JSON executor.

Use this for:

- strict JSON input/output history
- repair status
- prompt template/version provenance

### AIUsageLog

Cost and token accounting for AI calls.

Use this for:

- prompt tokens
- completion tokens
- cost estimate
- provider/model usage reporting

## Semantic Intelligence Snapshots

### SemanticNebulaSnapshot

Versioned semantic graph output for one project/subject/scope.

Stores:

- nodes
- edges
- summary
- evidence JSON

V1 intentionally uses JSON snapshots. Split normalized `SemanticTerm` or `SemanticEvidence` tables only when cross-run trend querying becomes a core requirement.

### LongTailOpportunitySnapshot

Prioritized long-tail answer inclusion opportunities.

Use this for:

- LOP scores
- priority lanes
- recommended content assets
- opportunity evidence

### QuestionTerritorySnapshot

Question and scenario ownership map.

Use this for:

- target-owned question spaces
- competitor-owned spaces
- no-clear-winner spaces
- high-opportunity clusters

## Brand Probe Objects

### BrandProbeRun

High-throughput brand semantic probe execution run.

This is separate from the general `SamplingRun` path and is designed for 500 probes/minute micro-batch execution.

### BrandProbe

One standardized measurement question.

Use this for:

- probe zone
- dimension
- question type
- semantic temperature
- sampling/measurement weights

### BrandProbeBatch

One micro-batch request group.

Use this for:

- batch size
- retry count
- token estimate
- degraded/split batch tracking

### BrandProbeResponse

Raw and parsed model output for one brand probe.

This is not a replacement for `AIResponse`; it belongs to the high-throughput brand probe subsystem.

### ExtractedSignal

Normalized signal extracted from a brand probe response.

Use this for:

- keywords
- competitors
- scenarios
- audiences
- risk
- sentiment
- recommendation
- opportunity

## Operational Objects

### AnalysisJob

Durable job tracking for queue-backed and local background workflows.

Use this for:

- job type
- status
- queue metadata
- current stage
- stage history
- error state

### TraceEvent

System event timeline for debugging and root-cause analysis.

Use this for:

- API request lifecycle
- queue enqueue/dequeue
- worker stages
- AI prompt execution
- JSON repair
- provider failures

TraceEvent should store safe summaries and IDs, not full raw AI output or secrets.

### AuditLog

Compliance-style record of who performed an action.

AuditLog answers "who did what"; TraceEvent answers "what happened inside the system".

## Naming Guidance

Use `ProjectSubject` and entity-aware copy for all new customer-facing work.

Keep `brandName` only for compatibility until all legacy flows are retired.

When adding a new AI output path, first decide whether it is:

- sampled answer evidence (`AIResponse`)
- structured prompt execution (`PromptRun`)
- high-throughput brand probe response (`BrandProbeResponse`)
- durable derived insight (`SemanticNebulaSnapshot`, `LongTailOpportunitySnapshot`, `QuestionTerritorySnapshot`)
