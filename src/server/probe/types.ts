import type { SubjectEntityType } from "@/generated/prisma/client";

export type ProbeFamily =
  | "recognition"
  | "semantic_clarity"
  | "association_structure"
  | "trust"
  | "recommendation_probability"
  | "competitor_distance"
  | "confusion_risk"
  | "citation_potential"
  | "gap_analysis"
  | "identity_clarity"
  | "expertise_strength"
  | "website_semantic_usability"
  | "product_understanding";

export type ProbeMetricDefinition = {
  key: string;
  label: string;
  scope: "common" | "entity_specific";
};

export type ProbeWorkflowStep = {
  key: string;
  label: string;
  required: boolean;
};

export type ProbeRegistryEntry = {
  entityType: SubjectEntityType;
  probeFamilies: ProbeFamily[];
  metrics: ProbeMetricDefinition[];
  workflowSteps: ProbeWorkflowStep[];
};

export type NormalizedProbeSubject = {
  id: string;
  projectId: string;
  entityType: SubjectEntityType;
  displayName: string;
  canonicalName: string;
  websiteUrl: string | null;
  market: string | null;
  language: string;
  profile: Record<string, unknown>;
};
