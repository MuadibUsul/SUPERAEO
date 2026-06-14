export type ProjectWizardEntityType = "BRAND" | "PERSON" | "WEBSITE" | "PRODUCT";

export function buildAuditNamePreview(input: {
  subjectName: string;
  fallbackSubject: string;
  language: string;
}) {
  const subject = input.subjectName.trim() || input.fallbackSubject;
  return input.language.toLowerCase().startsWith("zh")
    ? `${subject} AI 认知审计`
    : `${subject} AI Cognition Audit`;
}

export function getComparisonCategory(entityType: ProjectWizardEntityType) {
  if (entityType === "PERSON") return "peer_expert";
  if (entityType === "WEBSITE") return "alternative_source";
  if (entityType === "PRODUCT") return "substitute_product";
  return "direct";
}
