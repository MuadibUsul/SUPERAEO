/**
 * Entity-type specs — the single source of truth that makes BRAND / PERSON /
 * WEBSITE / PRODUCT behave per their own needs across the pipeline (probes,
 * metrics emphasis, report verdict). See docs/architecture/entity-type-design.md.
 */
import type { SubjectEntityType } from "@/generated/prisma/client";
import type { Locale } from "@/i18n/config";

export type EntityType = SubjectEntityType; // "BRAND" | "PERSON" | "WEBSITE" | "PRODUCT"

export type EntityMetricKey =
  | "recognition"
  | "recommendationShare"
  | "citationRate"
  | "accuracy"
  | "authority"
  | "featureAccuracy"
  | "competitorDelta"
  | "semanticCoverage";

export type EntityProfileSpec = {
  type: EntityType;
  competitorKind: "direct" | "peer_expert" | "alternative_source" | "substitute_product";
  /** Metrics to surface first in the report, in priority order. */
  primaryMetrics: EntityMetricKey[];
  topRisk: Record<Locale, string>;
  /** How the report verdict opens for this type. {subject} is interpolated. */
  verdictLead: Record<Locale, string>;
};

export const entityProfiles: Record<EntityType, EntityProfileSpec> = {
  BRAND: {
    type: "BRAND",
    competitorKind: "direct",
    primaryMetrics: ["recommendationShare", "recognition", "competitorDelta"],
    topRisk: {
      "zh-CN": "在品类推荐中隐身，或被 AI 错误归类。",
      en: "Going invisible in category recommendations, or being mis-categorized.",
    },
    verdictLead: {
      "zh-CN": "AI 把 {subject} 理解为一个什么样的品牌、在品类里如何推荐它。",
      en: "How AI frames {subject} as a brand and recommends it within its category.",
    },
  },
  PERSON: {
    type: "PERSON",
    competitorKind: "peer_expert",
    primaryMetrics: ["recognition", "accuracy", "authority"],
    topRisk: {
      "zh-CN": "AI 编造履历事实，或与同名的其他人混淆。",
      en: "AI hallucinating biographical facts, or confusing them with a same-name person.",
    },
    verdictLead: {
      "zh-CN": "AI 是否认识 {subject}、记得是否准确、是否被视为该领域的权威。",
      en: "Whether AI knows {subject}, states their facts accurately, and treats them as an authority.",
    },
  },
  WEBSITE: {
    type: "WEBSITE",
    competitorKind: "alternative_source",
    primaryMetrics: ["citationRate", "authority", "semanticCoverage"],
    topRisk: {
      "zh-CN": "完全不被引用，或目标主题被其他来源占据。",
      en: "Not being cited at all, or a rival source owning your topics.",
    },
    verdictLead: {
      "zh-CN": "AI 是否把 {subject} 当作可信来源、为哪些主题引用它。",
      en: "Whether AI treats {subject} as a trusted source and for which topics it cites it.",
    },
  },
  PRODUCT: {
    type: "PRODUCT",
    competitorKind: "substitute_product",
    primaryMetrics: ["recommendationShare", "featureAccuracy", "competitorDelta"],
    topRisk: {
      "zh-CN": "参数/特性被说错，或在与替代品的对比中落败。",
      en: "Wrong specs/features, or losing comparisons to substitute products.",
    },
    verdictLead: {
      "zh-CN": "AI 在哪些使用场景推荐 {subject}、对它的特性记得是否准确。",
      en: "For which use-cases AI recommends {subject} and whether it gets the features right.",
    },
  },
};

export function getEntityProfile(type: EntityType | string | null | undefined): EntityProfileSpec {
  if (type && type in entityProfiles) return entityProfiles[type as EntityType];
  return entityProfiles.BRAND;
}

const metricLabels: Record<EntityMetricKey, Record<Locale, string>> = {
  recognition: { "zh-CN": "认知度", en: "Recognition" },
  recommendationShare: { "zh-CN": "推荐占比", en: "Recommendation share" },
  citationRate: { "zh-CN": "被引用率", en: "Citation rate" },
  accuracy: { "zh-CN": "事实准确性", en: "Factual accuracy" },
  authority: { "zh-CN": "权威度", en: "Authority" },
  featureAccuracy: { "zh-CN": "特性准确性", en: "Feature accuracy" },
  competitorDelta: { "zh-CN": "竞品差距", en: "Competitor gap" },
  semanticCoverage: { "zh-CN": "主题覆盖", en: "Topic coverage" },
};

export function getEntityMetricLabel(key: EntityMetricKey, locale: Locale): string {
  return metricLabels[key][locale];
}
