import { z } from "zod";

export const generateKeywordsRequestSchema = z.object({
  optionalSeedKeywords: z.array(z.string().trim().min(1)).optional().default([]),
});

export const generateQueriesRequestSchema = z.object({
  minQueries: z.coerce.number().int().min(10).max(100).default(50),
  maxQueries: z.coerce.number().int().min(10).max(100).default(80),
  personaTypes: z.array(z.enum(["founder", "ceo", "cto", "buyer", "marketer", "consumer", "analyst"])).optional().default(["buyer", "marketer", "cto"]),
  regions: z.array(z.string().trim().min(2)).optional().default(["US"]),
  contextModes: z.array(z.enum(["cold_start", "industry_context", "competitive_context", "preference_guided"])).optional().default(["cold_start", "competitive_context"]),
  queryDepthLevels: z.array(z.enum(["primary", "sub_question", "implicit", "decision", "risk", "comparison", "follow_up"])).optional().default(["primary", "decision", "risk", "comparison"]),
});

export const createRunRequestSchema = z.object({
  runType: z.enum(["baseline", "retest"]).default("baseline"),
  platforms: z.array(z.string()).default(["openai"]),
  sampleCountPerQuery: z.coerce.number().int().min(1).max(5).default(1),
  queryIds: z.array(z.string()).optional().default([]),
  modelMatrix: z
    .array(
      z.object({
        providerId: z.string().trim().min(1),
        modelId: z.string().trim().min(1).optional(),
        model: z.string().trim().min(1).optional(),
      }),
    )
    .max(6)
    .optional(),
  samplingStrategy: z
    .object({
      personas: z.array(z.string()).default(["buyer"]),
      regions: z.array(z.string()).default(["US"]),
      contextModes: z.array(z.string()).default(["cold_start"]),
      routingTier: z.enum(["low_cost_sampling", "mid_tier_verification", "high_fidelity_audit"]).default("low_cost_sampling"),
    })
    .optional(),
});
