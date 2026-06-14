import type { NebulaScope, SemanticNebulaNode } from "@/server/semantic-nebula/types";

export const nebulaScopeRegistry: Record<
  NebulaScope,
  {
    labelKey: string;
    descriptionKey: string;
    filter: (node: SemanticNebulaNode) => boolean;
  }
> = {
  OVERALL: {
    labelKey: "overall",
    descriptionKey: "overallDescription",
    filter: () => true,
  },
  POSITIVE_NEGATIVE: {
    labelKey: "positiveNegative",
    descriptionKey: "positiveNegativeDescription",
    filter: (node) => ["POSITIVE", "NEGATIVE", "MIXED"].includes(node.polarity),
  },
  SCENARIO: {
    labelKey: "scenario",
    descriptionKey: "scenarioDescription",
    filter: (node) => ["SCENARIO", "AUDIENCE", "FUNCTIONAL"].includes(node.termType),
  },
  COMPETITOR: {
    labelKey: "competitor",
    descriptionKey: "competitorDescription",
    filter: (node) => node.termType === "COMPETITOR" || node.context.competitorContext,
  },
  MISSING: {
    labelKey: "missing",
    descriptionKey: "missingDescription",
    filter: (node) => node.termType === "MISSING" || node.context.missingDesired,
  },
  RISK: {
    labelKey: "risk",
    descriptionKey: "riskDescription",
    filter: (node) =>
      ["RISK", "INCORRECT", "UNDESIRED", "NEGATIVE"].includes(node.termType) ||
      node.polarity === "NEGATIVE" ||
      node.context.riskContext,
  },
};

export function getNebulaScopeDefinition(scope: NebulaScope) {
  return nebulaScopeRegistry[scope];
}

