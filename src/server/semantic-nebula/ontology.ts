import type { SubjectEntityType } from "@/generated/prisma/client";

export const semanticDomains = [
  "ENTITY",
  "ATTRIBUTE",
  "RELATION",
  "ACTION",
  "EVENT",
  "FUNCTION",
  "CONTEXT",
  "CAUSE_EFFECT",
  "EVALUATION",
  "RISK_OPPORTUNITY",
  "TEMPORAL",
  "QUANTITATIVE",
  "EVIDENCE",
] as const;

export type SemanticDomain = (typeof semanticDomains)[number];

export const semanticDomainTypes: Record<SemanticDomain, readonly string[]> = {
  ENTITY: ["PERSON", "ORGANIZATION", "COMPANY", "PRODUCT", "SERVICE", "TECHNOLOGY", "BRAND", "LOCATION", "COUNTRY", "REGION", "INDUSTRY", "MARKET", "PLATFORM", "STANDARD", "MATERIAL", "RESOURCE", "CONCEPT"],
  ATTRIBUTE: ["PROPERTY", "QUALITY", "STATE", "STATUS", "IDENTITY", "CATEGORY", "POSITIONING", "REPUTATION", "CAPABILITY", "CHARACTERISTIC"],
  RELATION: ["COMPETITION", "COOPERATION", "DEPENDENCY", "OWNERSHIP", "CONTROL", "HIERARCHY", "PART_WHOLE", "SUPPLY_CHAIN", "CUSTOMER", "SUPPLIER", "PARTNER", "INVESTOR", "REGULATOR", "CREATOR", "USER", "ASSOCIATION", "SIMILARITY", "ALTERNATIVE", "SUBSTITUTION"],
  ACTION: ["PRODUCES", "DEVELOPS", "USES", "SELLS", "BUYS", "SUPPLIES", "INVESTS_IN", "ACQUIRES", "PARTNERS_WITH", "COMPETES_WITH", "DEPENDS_ON", "ENABLES", "REPLACES", "CONSUMES", "CREATES", "OPERATES", "PROVIDES"],
  EVENT: ["PRODUCT_LAUNCH", "ACQUISITION", "MERGER", "FUNDING", "EARNINGS", "REGULATION", "POLICY_CHANGE", "CRISIS", "MARKET_SHOCK", "TECH_BREAKTHROUGH", "LEADERSHIP_CHANGE", "LEGAL_EVENT", "SUPPLY_EVENT", "SECURITY_EVENT"],
  FUNCTION: ["PURPOSE", "FUNCTION", "APPLICATION", "USE_CASE", "MECHANISM", "PROCESS", "METHOD", "INPUT", "OUTPUT"],
  CONTEXT: ["USER", "CUSTOMER", "AUDIENCE", "BUYER", "STAKEHOLDER", "SCENARIO", "CONTEXT", "GEOGRAPHY", "MARKET", "INDUSTRY", "CONDITION", "ENVIRONMENT"],
  CAUSE_EFFECT: ["CAUSE", "DRIVER", "CATALYST", "TRIGGER", "EFFECT", "OUTCOME", "CONSEQUENCE", "IMPACT"],
  EVALUATION: ["ADVANTAGE", "STRENGTH", "MOAT", "BENEFIT", "WEAKNESS", "DISADVANTAGE", "LIMITATION", "VULNERABILITY", "SENTIMENT", "REPUTATION", "COMPARISON", "OUTPERFORMANCE", "UNDERPERFORMANCE", "RECOMMENDATION"],
  RISK_OPPORTUNITY: ["RISK", "THREAT", "CONSTRAINT", "EXPOSURE", "OPPORTUNITY", "POTENTIAL", "GROWTH_AREA", "EMERGING_MARKET", "WHITE_SPACE"],
  TEMPORAL: ["DATE", "TIME", "PERIOD", "ERA", "MILESTONE", "SEQUENCE", "BEFORE", "AFTER", "DURING", "TREND", "CHANGE", "DIRECTION"],
  QUANTITATIVE: ["METRIC", "VALUE", "QUANTITY", "RATIO", "PERCENTAGE", "PRICE", "MARKET_SHARE", "REVENUE", "GROWTH", "RANK", "CAPACITY", "PERFORMANCE"],
  EVIDENCE: ["CLAIM", "EVIDENCE", "SOURCE", "CITATION", "OBSERVATION"],
};

export type RelationDefinition = {
  canonicalName: string;
  aliases: readonly string[];
  domain: SemanticDomain;
  inverse?: string;
  symmetric?: boolean;
  transitive?: boolean;
};

export const relationOntology: readonly RelationDefinition[] = [
  { canonicalName: "COMPETES_WITH", aliases: ["COMPETITOR_OF", "RIVALS", "COMPETES_AGAINST", "竞争", "竞品", "与…竞争"], domain: "RELATION", symmetric: true },
  { canonicalName: "COOPERATES_WITH", aliases: ["COOPERATION", "COLLABORATES_WITH", "合作"], domain: "RELATION", symmetric: true },
  { canonicalName: "DEPENDS_ON", aliases: ["DEPENDENCY", "RELIANT_ON", "依赖", "依赖于"], domain: "RELATION" },
  { canonicalName: "OWNS", aliases: ["OWNERSHIP", "OWNER_OF", "拥有", "持有"], domain: "RELATION", inverse: "OWNED_BY" },
  { canonicalName: "PART_OF", aliases: ["PART_WHOLE", "BELONGS_TO", "组成部分", "属于"], domain: "RELATION", inverse: "HAS_PART", transitive: true },
  { canonicalName: "SUPPLIES", aliases: ["SUPPLIER_OF", "SUPPLY_CHAIN", "PROVIDES_TO", "供应", "供应商"], domain: "ACTION", inverse: "SOURCED_FROM" },
  { canonicalName: "PARTNERS_WITH", aliases: ["PARTNER", "PARTNERS", "STRATEGIC_PARTNER", "伙伴", "合作伙伴"], domain: "ACTION", symmetric: true },
  { canonicalName: "PRODUCES", aliases: ["MANUFACTURES", "MAKES", "生产", "制造"], domain: "ACTION" },
  { canonicalName: "DEVELOPS", aliases: ["CREATES", "BUILDS", "开发", "研发"], domain: "ACTION" },
  { canonicalName: "USES", aliases: ["UTILIZES", "ADOPTS", "使用", "采用"], domain: "ACTION" },
  { canonicalName: "ACQUIRES", aliases: ["ACQUISITION_OF", "BUYS_COMPANY", "收购"], domain: "ACTION" },
  { canonicalName: "ENABLES", aliases: ["MAKES_POSSIBLE", "支持", "赋能", "使能"], domain: "ACTION" },
  { canonicalName: "REPLACES", aliases: ["SUBSTITUTES_FOR", "ALTERNATIVE_TO", "替代"], domain: "ACTION" },
  { canonicalName: "CAUSES", aliases: ["CAUSE", "TRIGGERS", "LEADS_TO", "导致", "引发"], domain: "CAUSE_EFFECT" },
  { canonicalName: "DRIVES", aliases: ["DRIVER_OF", "PROMOTES", "推动", "驱动"], domain: "CAUSE_EFFECT" },
  { canonicalName: "INCREASES", aliases: ["RAISES", "GROWS", "增加", "提升"], domain: "CAUSE_EFFECT" },
  { canonicalName: "DECREASES", aliases: ["REDUCES", "LOWERS", "减少", "降低"], domain: "CAUSE_EFFECT" },
  { canonicalName: "USED_FOR", aliases: ["APPLICATION_OF", "PURPOSE_OF", "用于", "应用于"], domain: "FUNCTION" },
  { canonicalName: "ASSOCIATED_WITH", aliases: ["ASSOCIATION", "RELATED_TO", "关联", "相关"], domain: "RELATION", symmetric: true },
] as const;

const relationAliases = new Map<string, string>();
for (const relation of relationOntology) {
  relationAliases.set(normalizeOntologyToken(relation.canonicalName), relation.canonicalName);
  for (const alias of relation.aliases) relationAliases.set(normalizeOntologyToken(alias), relation.canonicalName);
}

const conceptAliases = new Map<string, string>([
  ["ai", "artificial intelligence"],
  ["a i", "artificial intelligence"],
  ["artificial intelligence", "artificial intelligence"],
  ["人工智能", "artificial intelligence"],
  ["机器智能", "artificial intelligence"],
  ["大模型", "large language model"],
  ["llm", "large language model"],
  ["large language model", "large language model"],
]);

export function normalizeOntologyToken(value: string) {
  return value.normalize("NFKC").trim().toLowerCase().replace(/[\s_-]+/g, " ").replace(/[^\p{L}\p{N}\s]/gu, "").trim();
}

export function canonicalizeRelation(value?: string | null) {
  if (!value) return undefined;
  const normalized = normalizeOntologyToken(value);
  return relationAliases.get(normalized) ?? normalized.toUpperCase().replace(/\s+/g, "_");
}

export function canonicalizeSemanticLabel(value: string) {
  const normalized = normalizeOntologyToken(value);
  return conceptAliases.get(normalized) ?? normalized;
}

export const probeZoneDomainMap = {
  core_semantics: ["ENTITY", "ATTRIBUTE", "FUNCTION"],
  implicit_recommendation: ["EVALUATION", "CONTEXT"],
  competition: ["RELATION", "ENTITY"],
  scenario_fit: ["CONTEXT", "FUNCTION"],
  audience_fit: ["CONTEXT", "ENTITY"],
  risk_boundary: ["RISK_OPPORTUNITY", "EVALUATION"],
  growth_opportunity: ["RISK_OPPORTUNITY", "EVENT"],
  calibration: ["EVIDENCE", "QUANTITATIVE"],
} as const satisfies Record<string, readonly SemanticDomain[]>;

const baseWeights = Object.fromEntries(semanticDomains.map((domain) => [domain, domain === "EVIDENCE" ? 0.5 : 1])) as Record<SemanticDomain, number>;

export function ontologyProfile(entityType: SubjectEntityType): Record<SemanticDomain, number> {
  const weights = { ...baseWeights };
  const raise = (...domains: SemanticDomain[]) => domains.forEach((domain) => { weights[domain] = 1.5; });
  if (entityType === "PERSON") raise("ENTITY", "ATTRIBUTE", "EVENT", "EVALUATION", "TEMPORAL");
  else if (entityType === "PRODUCT") raise("FUNCTION", "ATTRIBUTE", "CONTEXT", "RELATION", "QUANTITATIVE");
  else if (entityType === "WEBSITE") raise("FUNCTION", "CONTEXT", "EVIDENCE", "ENTITY", "EVALUATION");
  else raise("RELATION", "ENTITY", "RISK_OPPORTUNITY", "FUNCTION", "EVALUATION");
  return weights;
}

export function legacyTermDomain(termType: string): { domain: SemanticDomain; type: string } {
  if (termType === "COMPETITOR") return { domain: "ENTITY", type: "COMPANY" };
  if (["RISK", "INCORRECT"].includes(termType)) return { domain: "RISK_OPPORTUNITY", type: "RISK" };
  if (termType === "AUDIENCE") return { domain: "CONTEXT", type: "AUDIENCE" };
  if (termType === "SCENARIO") return { domain: "CONTEXT", type: "SCENARIO" };
  if (termType === "FUNCTIONAL") return { domain: "FUNCTION", type: "FUNCTION" };
  if (termType === "BENEFIT") return { domain: "EVALUATION", type: "BENEFIT" };
  if (["POSITIVE", "NEGATIVE", "TRUST", "DESIRED", "UNDESIRED", "MISSING"].includes(termType)) return { domain: "EVALUATION", type: termType };
  if (termType === "CATEGORY") return { domain: "ATTRIBUTE", type: "CATEGORY" };
  return { domain: "ATTRIBUTE", type: "PROPERTY" };
}
