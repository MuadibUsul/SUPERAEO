import { z } from "zod";

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

export const recommendedBrandSchema = z.object({
  brand: z.string().trim().min(1),
  rank: z.number().int().min(1).max(20).nullable().optional(),
  score: z.number().min(0).max(100).nullable().optional(),
  reason_tags: z.array(z.string().trim().min(1)).max(8).default([]),
});

export const probeResponseSchema = z.object({
  probe_id: z.string().trim().min(1),
  mentioned_brand: z.boolean().nullable().optional(),
  recommended_brands: z.array(recommendedBrandSchema).max(10).default([]),
  keywords: z.array(z.string().trim().min(1)).max(10).default([]),
  competitors: z.array(z.string().trim().min(1)).max(5).default([]),
  scenarios: z.array(z.string().trim().min(1)).max(5).default([]),
  audiences: z.array(z.string().trim().min(1)).max(5).default([]),
  risk_words: z.array(z.string().trim().min(1)).max(5).default([]),
  opportunity_words: z.array(z.string().trim().min(1)).max(5).default([]),
  sentiment_score: z.number().min(-1).max(1).nullable().optional(),
  recommendation_score: z.number().min(0).max(100).nullable().optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
});

export const probeBatchResponseSchema = z.array(probeResponseSchema).min(1).max(10);

export type ProbeResponseJson = z.infer<typeof probeResponseSchema>;

export const probeResponseJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "probe_id",
    "mentioned_brand",
    "recommended_brands",
    "keywords",
    "competitors",
    "scenarios",
    "audiences",
    "risk_words",
    "opportunity_words",
    "sentiment_score",
    "recommendation_score",
    "confidence",
  ],
  properties: {
    probe_id: { type: "string" },
    mentioned_brand: { type: ["boolean", "null"] },
    recommended_brands: {
      type: "array",
      maxItems: 10,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["brand", "rank", "score", "reason_tags"],
        properties: {
          brand: { type: "string" },
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
  },
} as const;

export const probeBatchResponseJsonSchema = {
  type: "array",
  minItems: 1,
  maxItems: 10,
  items: probeResponseJsonSchema,
} as const;
