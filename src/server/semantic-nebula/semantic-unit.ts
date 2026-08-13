import { createHash } from "node:crypto";
import { z } from "zod";

import { canonicalizeRelation, canonicalizeSemanticLabel, semanticDomains, type SemanticDomain } from "@/server/semantic-nebula/ontology";

export const semanticUnitInputSchema = z.object({
  domain: z.enum(semanticDomains),
  type: z.string().trim().min(1),
  canonicalLabel: z.string().trim().optional(),
  surfaceForm: z.string().trim().optional(),
  description: z.string().trim().optional(),
  subject: z.string().trim().optional(),
  predicate: z.string().trim().optional(),
  object: z.string().trim().optional(),
  value: z.union([z.number(), z.string()]).optional(),
  unit: z.string().trim().optional(),
  polarity: z.enum(["positive", "negative", "neutral"]).optional(),
  negated: z.boolean().optional(),
  uncertainty: z.enum(["certain", "possible", "likely", "expected", "rumored", "estimated", "unknown"]).optional(),
  confidence: z.number().min(0).max(1).optional(),
  intensity: z.number().min(0).max(1).optional(),
  temporal: z.object({ from: z.string().optional(), to: z.string().optional(), label: z.string().optional() }).optional(),
  condition: z.string().trim().optional(),
});

export type SemanticUnitInput = z.infer<typeof semanticUnitInputSchema>;

export type SemanticUnitSource = {
  probeId?: string;
  responseId?: string;
  runId?: string;
  providerId?: string;
  modelId?: string;
};

export type SemanticUnit = SemanticUnitInput & {
  id: string;
  projectId: string;
  subjectId: string;
  canonicalLabel: string;
  surfaceForm: string;
  iteration: number;
  semanticDepth: number;
  source: SemanticUnitSource;
};

export type ProbeSemanticUnitSource = {
  projectId: string;
  subjectId: string;
  runId: string;
  probeId: string;
  responseId: string;
  providerId?: string | null;
  model: string;
  iteration?: number;
  semanticDepth?: number;
  zone: string;
  data: {
    semantic_units?: SemanticUnitInput[];
    keywords?: string[];
    competitors?: string[];
    scenarios?: string[];
    audiences?: string[];
    risk_words?: string[];
    opportunity_words?: string[];
    recommended_brands?: Array<{ brand: string; score?: number | null; reason_tags?: string[] }>;
    confidence?: number | null;
  };
};

export type SemanticUnitContext = {
  projectId: string;
  subjectId: string;
  runId?: string;
  probeId?: string;
  responseId?: string;
  providerId?: string | null;
  model?: string;
  iteration?: number;
  semanticDepth?: number;
};

export function buildSemanticUnit(input: SemanticUnitInput, context: SemanticUnitContext): SemanticUnit {
  const predicate = canonicalizeRelation(input.predicate);
  const surfaceForm = input.surfaceForm || input.canonicalLabel || input.object || input.description || String(input.value ?? input.type);
  const canonicalLabel = canonicalizeSemanticLabel(input.canonicalLabel || input.object || surfaceForm);
  const key = [context.projectId, context.subjectId, input.domain, input.type, input.subject, predicate, input.object, canonicalLabel, input.negated, input.condition, input.value, input.unit, context.model].join("|");
  return {
    ...input,
    id: `su_${createHash("sha1").update(key).digest("hex").slice(0, 20)}`,
    projectId: context.projectId,
    subjectId: context.subjectId,
    canonicalLabel,
    surfaceForm,
    predicate,
    confidence: input.confidence ?? 0.5,
    negated: input.negated ?? false,
    uncertainty: input.uncertainty ?? "unknown",
    iteration: context.iteration ?? 0,
    semanticDepth: context.semanticDepth ?? 0,
    source: {
      probeId: context.probeId,
      responseId: context.responseId,
      runId: context.runId,
      providerId: context.providerId ?? undefined,
      modelId: context.model,
    },
  };
}

export function extractProbeSemanticUnits(input: ProbeSemanticUnitSource): SemanticUnit[] {
  const structured = z.array(semanticUnitInputSchema).safeParse(input.data.semantic_units ?? []);
  const rawUnits = structured.success && structured.data.length > 0 ? structured.data : fallbackUnits(input.zone, input.data);
  const units = rawUnits.map((unit) => buildSemanticUnit(unit, input));
  return Array.from(new Map(units.map((unit) => [semanticUnitKey(unit), unit])).values());
}

export function semanticUnitKey(unit: Pick<SemanticUnit, "domain" | "type" | "canonicalLabel" | "subject" | "predicate" | "object" | "negated" | "condition" | "value" | "unit">) {
  return [unit.domain, unit.type, unit.subject ? canonicalizeSemanticLabel(unit.subject) : "", unit.predicate ?? "", unit.object ? canonicalizeSemanticLabel(unit.object) : "", unit.canonicalLabel, unit.negated ? "negated" : "affirmed", unit.condition ?? "", unit.value ?? "", unit.unit ?? ""].join("|");
}

function fallbackUnits(zone: string, data: ProbeSemanticUnitSource["data"]): SemanticUnitInput[] {
  const confidence = data.confidence ?? 0.5;
  const units: SemanticUnitInput[] = [];
  const add = (domain: SemanticDomain, type: string, values: string[], predicate?: string) => {
    for (const value of values ?? []) units.push({ domain, type, canonicalLabel: value, surfaceForm: value, object: value, predicate, confidence });
  };

  const keywordDomain: SemanticDomain = zone === "competition" ? "RELATION" : zone === "scenario_fit" ? "FUNCTION" : zone === "risk_boundary" ? "EVALUATION" : "ATTRIBUTE";
  add(keywordDomain, keywordDomain === "RELATION" ? "ASSOCIATION" : keywordDomain === "FUNCTION" ? "USE_CASE" : keywordDomain === "EVALUATION" ? "VULNERABILITY" : "PROPERTY", data.keywords ?? []);
  add("ENTITY", "COMPANY", data.competitors ?? [], "COMPETES_WITH");
  add("CONTEXT", "SCENARIO", data.scenarios ?? [], "USED_IN");
  add("CONTEXT", "AUDIENCE", data.audiences ?? [], "PREFERRED_BY");
  add("RISK_OPPORTUNITY", "RISK", data.risk_words ?? []);
  add("RISK_OPPORTUNITY", "OPPORTUNITY", data.opportunity_words ?? []);
  for (const brand of data.recommended_brands ?? []) {
    units.push({ domain: "EVALUATION", type: "RECOMMENDATION", canonicalLabel: brand.brand, surfaceForm: brand.brand, object: brand.brand, predicate: "RECOMMENDS", confidence, intensity: typeof brand.score === "number" ? brand.score / 100 : undefined, description: brand.reason_tags?.join(", ") });
  }
  return units;
}
