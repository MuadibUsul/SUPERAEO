import { z } from "zod";

import { semanticDomains } from "@/server/semantic-nebula/ontology";

export const probeRunModes = ["demo", "standard", "max500", "max1000"] as const;
export const probeDepthLevels = ["primary", "rationale", "decision", "comparison"] as const;
export const probeExecutionModes = ["single", "micro_batch"] as const;
export const probeZones = [
  "core_semantics",
  "implicit_recommendation",
  "competition",
  "scenario_fit",
  "audience_fit",
  "risk_boundary",
  "growth_opportunity",
  "calibration",
] as const;
export const probeQuestionTypes = [
  "explicit_association",
  "implicit_recommendation",
  "competitor_ranking",
  "scenario_fit",
  "audience_fit",
  "risk_boundary",
  "growth_opportunity",
  "calibration",
] as const;
export const semanticTemperatures = ["hot", "warm", "cold"] as const;

export type ProbeRunMode = (typeof probeRunModes)[number];
export type ProbeDepthLevel = (typeof probeDepthLevels)[number];
export type ProbeExecutionMode = (typeof probeExecutionModes)[number];
export type ProbeZone = (typeof probeZones)[number];
export type ProbeQuestionType = (typeof probeQuestionTypes)[number];
export type SemanticTemperature = (typeof semanticTemperatures)[number];

export type ProbeRunConfig = {
  mode: ProbeRunMode;
  executionMode: ProbeExecutionMode;
  targetThroughputPerMinute: number;
  microBatchSize: number;
  requestRateLimit: number;
  requestRateLimitMin: number;
  requestRateLimitMax: number;
  maxConcurrency: number;
  maxConcurrencyMin: number;
  maxConcurrencyMax: number;
  tokensPerMinuteBudget: number;
  tokensPerMinuteMin: number;
  tokensPerMinuteMax: number;
  maxRetries: number;
  singleMaxOutputTokens: number;
  batchMaxOutputTokens: number;
  defaultModel: string;
  modelTemperature: number;
};

export type SeedPool = {
  hotTerms: string[];
  warmTerms: string[];
  coldTerms: string[];
  coreCompetitors: string[];
  adjacentCompetitors: string[];
  substitutionCompetitors: string[];
  scenarios: string[];
  audiences: string[];
  intents: string[];
  risks: string[];
  opportunities: string[];
};

export type GeneratedProbe = {
  dimension: string;
  zone: ProbeZone;
  questionType: ProbeQuestionType;
  semanticTemperature: SemanticTemperature;
  weight: number;
  samplingWeight: number;
  measurementWeight: number;
  modelTemperature: number;
  language: string;
  prompt: string;
  expectedOutputSchema: Record<string, unknown>;
  variables: Record<string, unknown>;
  qualityScore: number;
};

const strictRecommendedEntitySchema = z.object({
  entity: z.string().trim().min(1),
  rank: z.number().int().min(1).max(20).nullable().optional(),
  score: z.number().min(0).max(100).nullable().optional(),
  reason_tags: z.array(z.string().trim().min(1)).max(8).default([]),
});

export const recommendedEntitySchema = z.preprocess(normalizeRecommendedEntity, strictRecommendedEntitySchema);

const nullableString = z.string().trim().nullable().optional().transform((value) => value ?? undefined);
const nullableNumber = z.number().nullable().optional().transform((value) => value ?? undefined);

const strictProbeSemanticUnitSchema = z.object({
  domain: z.enum(semanticDomains),
  type: z.string().trim().min(1),
  canonicalLabel: nullableString,
  surfaceForm: nullableString,
  description: nullableString,
  subject: nullableString,
  predicate: nullableString,
  object: nullableString,
  value: z.union([z.number(), z.string()]).nullable().optional().transform((value) => value ?? undefined),
  unit: nullableString,
  polarity: z.enum(["positive", "negative", "neutral"]).nullable().optional().transform((value) => value ?? undefined),
  negated: z.boolean().default(false),
  uncertainty: z.enum(["certain", "possible", "likely", "expected", "rumored", "estimated", "unknown"]).default("unknown"),
  confidence: z.number().min(0).max(1).default(0.5),
  intensity: nullableNumber,
  temporal: z.object({ from: nullableString, to: nullableString, label: nullableString }).nullable().optional().transform((value) => value ?? undefined),
  condition: nullableString,
});

export const probeSemanticUnitSchema = z.preprocess(normalizeSemanticUnit, strictProbeSemanticUnitSchema);

const strictProbeResponseSchema = z.object({
  probe_id: z.string().trim().min(1),
  target_mentioned: z.boolean().nullable().optional(),
  recommended_entities: z.array(recommendedEntitySchema).max(10).default([]),
  keywords: z.array(z.string().trim().min(1)).max(10).default([]),
  competitors: z.array(z.string().trim().min(1)).max(5).default([]),
  scenarios: z.array(z.string().trim().min(1)).max(5).default([]),
  audiences: z.array(z.string().trim().min(1)).max(5).default([]),
  risk_words: z.array(z.string().trim().min(1)).max(5).default([]),
  opportunity_words: z.array(z.string().trim().min(1)).max(5).default([]),
  sentiment_score: z.number().min(-1).max(1).nullable().optional(),
  recommendation_score: z.number().min(0).max(100).nullable().optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
  semantic_units: z.array(probeSemanticUnitSchema).max(12).default([]),
});

export const probeResponseSchema = z.preprocess(normalizeProbeResponse, strictProbeResponseSchema);

export const probeBatchResponseSchema = z.preprocess(
  (value) => asRecord(value)?.items ?? value,
  z.array(probeResponseSchema).min(1).max(10),
);

export type ProbeResponseJson = z.infer<typeof probeResponseSchema>;

export const probeResponseJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "probe_id",
    "target_mentioned",
    "recommended_entities",
    "keywords",
    "competitors",
    "scenarios",
    "audiences",
    "risk_words",
    "opportunity_words",
    "sentiment_score",
    "recommendation_score",
    "confidence",
    "semantic_units",
  ],
  properties: {
    probe_id: { type: "string" },
    target_mentioned: { type: ["boolean", "null"] },
    recommended_entities: {
      type: "array",
      maxItems: 10,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["entity", "rank", "score", "reason_tags"],
        properties: {
          entity: { type: "string" },
          rank: { type: ["number", "null"] },
          score: { type: ["number", "null"] },
          reason_tags: { type: "array", maxItems: 8, items: { type: "string" } },
        },
      },
    },
    keywords: { type: "array", maxItems: 10, items: { type: "string" } },
    competitors: { type: "array", maxItems: 5, items: { type: "string" } },
    scenarios: { type: "array", maxItems: 5, items: { type: "string" } },
    audiences: { type: "array", maxItems: 5, items: { type: "string" } },
    risk_words: { type: "array", maxItems: 5, items: { type: "string" } },
    opportunity_words: { type: "array", maxItems: 5, items: { type: "string" } },
    sentiment_score: { type: ["number", "null"] },
    recommendation_score: { type: ["number", "null"] },
    confidence: { type: ["number", "null"] },
    semantic_units: {
      type: "array",
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["domain", "type", "canonicalLabel", "surfaceForm", "description", "subject", "predicate", "object", "value", "unit", "polarity", "negated", "uncertainty", "confidence", "intensity", "temporal", "condition"],
        properties: {
          domain: { type: "string", enum: [...semanticDomains] },
          type: { type: "string" },
          canonicalLabel: { type: ["string", "null"] },
          surfaceForm: { type: ["string", "null"] },
          description: { type: ["string", "null"] },
          subject: { type: ["string", "null"] },
          predicate: { type: ["string", "null"] },
          object: { type: ["string", "null"] },
          value: { type: ["number", "string", "null"] },
          unit: { type: ["string", "null"] },
          polarity: { type: ["string", "null"], enum: ["positive", "negative", "neutral", null] },
          negated: { type: "boolean" },
          uncertainty: { type: "string", enum: ["certain", "possible", "likely", "expected", "rumored", "estimated", "unknown"] },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          intensity: { type: ["number", "null"], minimum: 0, maximum: 1 },
          temporal: {
            type: ["object", "null"],
            additionalProperties: false,
            required: ["from", "to", "label"],
            properties: { from: { type: ["string", "null"] }, to: { type: ["string", "null"] }, label: { type: ["string", "null"] } },
          },
          condition: { type: ["string", "null"] },
        },
      },
    },
  },
} as const;

export const probeBatchResponseJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      minItems: 1,
      maxItems: 10,
      items: probeResponseJsonSchema,
    },
  },
} as const;

const legacyProbeProperties = Object.fromEntries(
  Object.entries(probeResponseJsonSchema.properties).filter(([field]) => field !== "semantic_units"),
) as Omit<typeof probeResponseJsonSchema.properties, "semantic_units">;
export const legacyProbeResponseJsonSchema = {
  ...probeResponseJsonSchema,
  required: probeResponseJsonSchema.required.filter((field) => field !== "semantic_units"),
  properties: legacyProbeProperties,
} as const;

export const legacyProbeBatchResponseJsonSchema = {
  ...probeBatchResponseJsonSchema,
  properties: {
    items: {
      ...probeBatchResponseJsonSchema.properties.items,
      items: legacyProbeResponseJsonSchema,
    },
  },
} as const;

function normalizeProbeResponse(value: unknown) {
  const source = asRecord(value);
  if (!source) return value;
  return {
    ...source,
    target_mentioned: booleanOrNull(source.target_mentioned ?? source.mentioned_brand),
    recommended_entities: arrayValue(source.recommended_entities ?? source.recommended_brands),
    keywords: stringArray(source.keywords),
    competitors: stringArray(source.competitors),
    scenarios: stringArray(source.scenarios),
    audiences: stringArray(source.audiences),
    risk_words: stringArray(source.risk_words),
    opportunity_words: stringArray(source.opportunity_words),
    semantic_units: arrayValue(source.semantic_units),
  };
}

function normalizeRecommendedEntity(value: unknown) {
  if (typeof value === "string") return { entity: value.trim(), reason_tags: [] };
  const source = asRecord(value);
  if (!source) return value;
  return {
    entity: stringValue(source.entity ?? source.brand ?? source.name ?? source.product),
    rank: numberOrNull(source.rank),
    score: numberOrNull(source.score),
    reason_tags: stringArray(source.reason_tags ?? source.reason_tag ?? source.reason),
  };
}

function normalizeSemanticUnit(value: unknown) {
  const source = asRecord(value);
  if (!source) return value;
  const domain = normalizeSemanticDomain(source.domain);
  return {
    ...source,
    domain,
    type: stringValue(source.type) || domain,
  };
}

function normalizeSemanticDomain(value: unknown): (typeof semanticDomains)[number] {
  const raw = stringValue(value);
  const upper = raw.toUpperCase();
  if (semanticDomains.includes(upper as (typeof semanticDomains)[number])) return upper as (typeof semanticDomains)[number];
  if (["BRAND", "PRODUCT", "AUDIENCE", "品牌", "产品", "人群"].includes(upper)) return "ENTITY";
  if (["ATTRIBUTE", "PREFERENCE", "STATE", "HEALTH", "SOCIAL", "属性", "偏好"].includes(upper)) return "ATTRIBUTE";
  if (["SCENARIO", "CONDITION", "场景", "条件"].includes(upper)) return "CONTEXT";
  if (["TREND", "趋势"].includes(upper)) return "TEMPORAL";
  if (["CONSTRAINT", "NEGATION", "COMPARISON", "约束", "否定", "比较"].includes(upper)) return "RELATION";
  if (["RECOMMENDATION", "DECISION", "GOAL", "USER_NEED", "REASON", "推荐", "决策", "选择", "意图", "目标"].includes(upper)) return "EVALUATION";
  return "CONTEXT";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function arrayValue(value: unknown) {
  if (Array.isArray(value)) return value;
  return value === null || value === undefined || value === "" ? [] : [value];
}

function stringArray(value: unknown) {
  return arrayValue(value).map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function booleanOrNull(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  if (Array.isArray(value)) return value.length > 0;
  return null;
}
