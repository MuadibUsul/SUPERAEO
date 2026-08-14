import type { Project, ProjectSubject } from "@/generated/prisma/client";
import { zoneQuotas } from "@/server/brand-probes/config";
import { scoreProbeQuality } from "@/server/brand-probes/probe-quality-scorer";
import { renderProbePrompt, semanticTemperatureForZone } from "@/server/brand-probes/probe-templates";
import { legacyProbeResponseJsonSchema, probeResponseJsonSchema, type GeneratedProbe, type ProbeRunConfig, type ProbeZone, type SeedPool } from "@/server/brand-probes/types";

const zoneQuestionType = {
  core_semantics: "explicit_association",
  implicit_recommendation: "implicit_recommendation",
  competition: "competitor_ranking",
  scenario_fit: "scenario_fit",
  audience_fit: "audience_fit",
  risk_boundary: "risk_boundary",
  growth_opportunity: "growth_opportunity",
  calibration: "calibration",
} as const;

const zoneWeights: Record<ProbeZone, { sampling: number; measurement: number }> = {
  core_semantics: { sampling: 0.14, measurement: 0.9 },
  implicit_recommendation: { sampling: 0.22, measurement: 1 },
  competition: { sampling: 0.22, measurement: 1 },
  scenario_fit: { sampling: 0.17, measurement: 0.9 },
  audience_fit: { sampling: 0.1, measurement: 0.78 },
  risk_boundary: { sampling: 0.09, measurement: 0.9 },
  growth_opportunity: { sampling: 0.07, measurement: 0.78 },
  calibration: { sampling: 0.05, measurement: 0.65 },
};

export function generateBrandProbes(input: {
  project: Project;
  subject?: ProjectSubject | null;
  seedPool: SeedPool;
  config: ProbeRunConfig;
  semanticExploration?: boolean;
}) {
  const quotas = zoneQuotas[input.config.mode];
  const brand = input.subject?.displayName || input.project.brandName;
  const language = input.subject?.language || input.project.language || "zh-CN";
  const entityType = input.subject?.entityType ?? "BRAND";
  const probes: GeneratedProbe[] = [];

  for (const [zone, count] of Object.entries(quotas) as [ProbeZone, number][]) {
    for (let index = 0; index < count; index += 1) {
      const questionType = zoneQuestionType[zone];
      const rendered = renderProbePrompt({
        brand,
        language,
        pool: input.seedPool,
        zone,
        questionType,
        entityType,
        index,
        semanticExploration: input.semanticExploration,
      });
      const qualityScore = scoreProbeQuality({
        zone,
        questionType,
        prompt: rendered.prompt,
        variables: rendered.variables,
      });
      if (qualityScore < 0.72) continue;
      const weights = zoneWeights[zone];
      probes.push({
        dimension: dimensionForZone(zone),
        zone,
        questionType,
        semanticTemperature: semanticTemperatureForZone(zone, index),
        weight: Math.round(weights.measurement * 100) / 100,
        samplingWeight: weights.sampling,
        measurementWeight: weights.measurement,
        modelTemperature: input.config.modelTemperature,
        language,
        prompt: rendered.prompt,
        expectedOutputSchema: (input.semanticExploration || process.env.SEMANTIC_EXPLORATION_ENABLED === "true" ? probeResponseJsonSchema : legacyProbeResponseJsonSchema) as unknown as Record<string, unknown>,
        variables: rendered.variables,
        qualityScore,
      });
    }
  }

  return probes;
}

function dimensionForZone(zone: ProbeZone) {
  if (zone === "core_semantics") return "brand_association";
  if (zone === "implicit_recommendation") return "answer_inclusion";
  if (zone === "competition") return "competitor_distance";
  if (zone === "scenario_fit") return "scenario_coverage";
  if (zone === "audience_fit") return "audience_fit";
  if (zone === "risk_boundary") return "risk_semantics";
  if (zone === "growth_opportunity") return "long_tail_opportunity";
  return "calibration";
}
