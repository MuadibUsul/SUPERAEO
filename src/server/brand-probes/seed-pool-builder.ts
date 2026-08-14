import type { Competitor, Project, ProjectSubject, SemanticKeyword } from "@/generated/prisma/client";
import type { SeedPool } from "@/server/brand-probes/types";
import { seedVocabularyFor } from "@/server/audit-types/spec";

const genericStop = new Set(["", "品牌", "产品", "服务", "公司", "brand", "product", "service", "company"]);

export function buildSeedPool(input: {
  project: Project;
  subject?: ProjectSubject | null;
  competitors: Pick<Competitor, "name" | "category">[];
  keywords?: Pick<SemanticKeyword, "keyword" | "keywordType">[];
}): SeedPool {
  const language = input.subject?.language || input.project.language || "zh-CN";
  const zh = language.toLowerCase().startsWith("zh");

  // The audit type decides what the probe slots mean. Without this every
  // non-beverage project was seeded with B2B procurement language — so a PERSON
  // audit asked who was more authoritative while its scenario slot said
  // "annual renewal decision", and all four types collapsed into one voice.
  const entityType = input.subject?.entityType ?? "BRAND";
  const vocabulary = seedVocabularyFor(entityType, language);

  const subjectName = input.subject?.displayName || input.project.brandName;
  const aliases = aliasesFromSubject(input.subject, subjectName);
  const category = input.project.industry || input.project.domain || (zh ? "该领域" : "this field");
  const market = input.project.targetMarket || (zh ? "目标人群" : "target audience");

  const keywordsByType = (type: SemanticKeyword["keywordType"]) =>
    unique((input.keywords ?? []).filter((item) => item.keywordType === type).map((item) => item.keyword));

  // Project-derived keywords are AI-generated for this specific subject, so they
  // always win. The spec vocabulary is the fallback that keeps a brand-new
  // project's probes type-appropriate instead of generic.
  const preferKeywords = (derived: string[], fallback: string[]) =>
    unique([...derived, ...fallback]);

  const scenarios = preferKeywords(keywordsByType("scenario"), vocabulary.scenarios);
  const intents = preferKeywords(keywordsByType("intent"), vocabulary.intents);
  const risks = preferKeywords(keywordsByType("risk"), vocabulary.risks);
  const audiences = unique([...vocabulary.audiences, market]);

  const hotTerms = unique([
    ...aliases,
    category,
    ...keywordsByType("category"),
    ...keywordsByType("attribute"),
    ...keywordsByType("intent"),
    ...vocabulary.categoryTerms,
  ]).filter((term) => !genericStop.has(term));

  const warmTerms = preferKeywords(
    unique([...keywordsByType("scenario"), ...keywordsByType("intent")]),
    vocabulary.warmTerms,
  );

  // Named comparison targets come only from what the customer declared, plus
  // competitors the models actually named in real answers. Nothing named is
  // invented — the old builder injected real brands (雪碧, Starbucks, ...) into
  // any beverage-looking project, and those names reached the customer report.
  //
  // The adjacent and substitution slots still get filled, but with generic
  // descriptors ("the category leader"), which prompt the model to name its own
  // comparison rather than having us assert a relationship that may not exist.
  const declared = unique([...input.competitors.map((item) => item.name), ...keywordsByType("competitor")]);
  const coreCompetitors = declared.slice(0, 5);
  const nonDirect = unique(
    input.competitors.filter((item) => item.category !== "direct").map((item) => item.name),
  ).filter((name) => !coreCompetitors.includes(name));

  const descriptors = vocabulary.comparisonDescriptors;
  const adjacentCompetitors = unique([...nonDirect, ...descriptors.slice(0, 2)]).slice(0, 5);
  const substitutionCompetitors = unique([
    ...declared.filter((name) => !coreCompetitors.includes(name)),
    ...descriptors.slice(2),
  ]).slice(0, 5);

  return {
    hotTerms,
    warmTerms,
    coldTerms: unique(vocabulary.coldTerms),
    coreCompetitors,
    adjacentCompetitors,
    substitutionCompetitors,
    scenarios,
    audiences,
    intents,
    risks,
    opportunities: warmTerms,
  };
}

function aliasesFromSubject(subject: ProjectSubject | null | undefined, fallback: string) {
  const profile = subject?.profileJson && typeof subject.profileJson === "object" && !Array.isArray(subject.profileJson)
    ? subject.profileJson as Record<string, unknown>
    : {};
  const rawAliases = Array.isArray(profile.aliases) ? profile.aliases.map(String) : [];
  return unique([fallback, subject?.canonicalName, ...rawAliases].filter(Boolean).map(String));
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
