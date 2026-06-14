import type { SubjectEntityType } from "@/generated/prisma/client";

import type { ProbeMetricDefinition, ProbeRegistryEntry } from "@/server/probe/types";

const commonMetrics: ProbeMetricDefinition[] = [
  { key: "recognition_score", label: "Recognition Score", scope: "common" },
  { key: "semantic_clarity_score", label: "Semantic Clarity Score", scope: "common" },
  { key: "trust_score", label: "Trust Score", scope: "common" },
  { key: "recommendation_probability", label: "Recommendation Probability", scope: "common" },
  { key: "confusion_risk", label: "Confusion Risk", scope: "common" },
  { key: "association_coverage", label: "Association Coverage", scope: "common" },
  { key: "evidence_strength", label: "Evidence Strength", scope: "common" },
  { key: "stability_score", label: "Stability Score", scope: "common" },
];

export const probeRegistry: Record<SubjectEntityType, ProbeRegistryEntry> = {
  BRAND: {
    entityType: "BRAND",
    probeFamilies: [
      "recognition",
      "semantic_clarity",
      "association_structure",
      "recommendation_probability",
      "competitor_distance",
      "trust",
      "confusion_risk",
      "gap_analysis",
    ],
    metrics: [
      ...commonMetrics,
      { key: "brand_association_strength", label: "Brand Association Strength", scope: "entity_specific" },
      { key: "competitor_distance", label: "Competitor Distance", scope: "entity_specific" },
      { key: "desired_association_match", label: "Desired Association Match", scope: "entity_specific" },
      { key: "undesired_association_risk", label: "Undesired Association Risk", scope: "entity_specific" },
    ],
    workflowSteps: [
      { key: "competitors", label: "Competitors", required: true },
      { key: "keywords", label: "Semantic Keywords", required: true },
      { key: "queries", label: "Probe Queries", required: true },
      { key: "runs", label: "Sampling Runs", required: true },
    ],
  },
  PERSON: {
    entityType: "PERSON",
    probeFamilies: [
      "recognition",
      "identity_clarity",
      "expertise_strength",
      "trust",
      "confusion_risk",
      "recommendation_probability",
      "association_structure",
    ],
    metrics: [
      ...commonMetrics,
      { key: "identity_clarity", label: "Identity Clarity", scope: "entity_specific" },
      { key: "expertise_strength", label: "Expertise Strength", scope: "entity_specific" },
      { key: "authority_signal", label: "Authority Signal", scope: "entity_specific" },
      { key: "work_binding_strength", label: "Work Binding Strength", scope: "entity_specific" },
    ],
    workflowSteps: [
      { key: "identity", label: "Identity", required: true },
      { key: "references", label: "Works and References", required: true },
      { key: "keywords", label: "Expertise Keywords", required: true },
      { key: "queries", label: "Probe Queries", required: true },
      { key: "runs", label: "Sampling Runs", required: true },
    ],
  },
  WEBSITE: {
    entityType: "WEBSITE",
    probeFamilies: [
      "recognition",
      "semantic_clarity",
      "website_semantic_usability",
      "citation_potential",
      "trust",
      "recommendation_probability",
      "gap_analysis",
    ],
    metrics: [
      ...commonMetrics,
      { key: "seo_foundation", label: "SEO Foundation", scope: "entity_specific" },
      { key: "aeo_readiness", label: "AEO Readiness", scope: "entity_specific" },
      { key: "semantic_usability", label: "Semantic Usability", scope: "entity_specific" },
      { key: "answer_extractability", label: "Answer Extractability", scope: "entity_specific" },
    ],
    workflowSteps: [
      { key: "website-context", label: "Website Context", required: true },
      { key: "keywords", label: "Semantic Keywords", required: true },
      { key: "queries", label: "Probe Queries", required: true },
      { key: "runs", label: "Sampling Runs", required: true },
    ],
  },
  PRODUCT: {
    entityType: "PRODUCT",
    probeFamilies: [
      "recognition",
      "product_understanding",
      "semantic_clarity",
      "recommendation_probability",
      "trust",
      "confusion_risk",
      "gap_analysis",
    ],
    metrics: [
      ...commonMetrics,
      { key: "title_clarity", label: "Title Clarity", scope: "entity_specific" },
      { key: "product_understanding", label: "Product Understanding", scope: "entity_specific" },
      { key: "benefit_recognition", label: "Benefit Recognition", scope: "entity_specific" },
      { key: "purchase_persuasion", label: "Purchase Persuasion", scope: "entity_specific" },
      { key: "differentiation", label: "Differentiation", scope: "entity_specific" },
    ],
    workflowSteps: [
      { key: "product-context", label: "Product Context", required: true },
      { key: "keywords", label: "Intent Keywords", required: true },
      { key: "queries", label: "Purchase Queries", required: true },
      { key: "runs", label: "Sampling Runs", required: true },
    ],
  },
};

export function getProbeRegistryEntry(entityType: SubjectEntityType) {
  return probeRegistry[entityType];
}
