import type { SemanticPolarity, SemanticTermType } from "@/server/semantic-nebula/types";
import { normalizeTerm } from "@/server/semantic-nebula/term-normalizer";

const positiveHints = [
  "trusted",
  "reliable",
  "affordable",
  "easy",
  "fast",
  "secure",
  "accurate",
  "best",
  "low sugar",
  "healthy",
  "credible",
  "权威",
  "可信",
  "低糖",
  "健康",
  "好用",
  "稳定",
  "小众",
];

const negativeHints = [
  "risk",
  "expensive",
  "confusing",
  "hallucination",
  "unsafe",
  "overclaim",
  "weak",
  "风险",
  "错误",
  "混淆",
  "不可信",
  "夸大",
  "负面",
];

const trustHints = ["trust", "credible", "citation", "authority", "expert", "可信", "权威", "引用", "专家"];
const benefitHints = ["benefit", "save", "reduce", "improve", "低糖", "省时", "增长", "提升", "替代"];
const audienceHints = ["for ", "team", "founder", "marketer", "developer", "新手", "团队", "人群", "独立开发者"];
const scenarioHints = ["when ", "how to", "use case", "scenario", "场景", "怎么办", "适合", "聚会", "办公室", "减脂"];
const riskHints = ["risk", "hallucination", "confusion", "overclaim", "风险", "错误", "混淆", "夸大"];

export function classifyTerm(input: {
  term: string;
  keywordType?: string | null;
  competitors?: string[];
  desiredTerms?: string[];
  undesiredTerms?: string[];
  contextFlags?: string[];
  fallbackPolarity?: SemanticPolarity;
}) {
  const normalized = normalizeTerm(input.term);
  const competitors = new Set((input.competitors ?? []).map(normalizeTerm));
  const desired = new Set((input.desiredTerms ?? []).map(normalizeTerm));
  const undesired = new Set((input.undesiredTerms ?? []).map(normalizeTerm));
  const flags = new Set(input.contextFlags ?? []);

  let termType: SemanticTermType = "OTHER";
  if (competitors.has(normalized) || input.keywordType === "competitor" || flags.has("competitor")) {
    termType = "COMPETITOR";
  } else if (desired.has(normalized)) {
    termType = "DESIRED";
  } else if (undesired.has(normalized)) {
    termType = "UNDESIRED";
  } else if (input.keywordType === "category") {
    termType = "CATEGORY";
  } else if (input.keywordType === "scenario") {
    termType = "SCENARIO";
  } else if (input.keywordType === "risk" || flags.has("risk")) {
    termType = "RISK";
  } else if (input.keywordType === "attribute") {
    termType = "DESCRIPTIVE";
  } else if (input.keywordType === "intent") {
    termType = "FUNCTIONAL";
  } else if (containsAny(normalized, riskHints)) {
    termType = "RISK";
  } else if (containsAny(normalized, trustHints)) {
    termType = "TRUST";
  } else if (containsAny(normalized, benefitHints)) {
    termType = "BENEFIT";
  } else if (containsAny(normalized, audienceHints)) {
    termType = "AUDIENCE";
  } else if (containsAny(normalized, scenarioHints)) {
    termType = "SCENARIO";
  }

  let polarity: SemanticPolarity = input.fallbackPolarity ?? "NEUTRAL";
  if (termType === "UNDESIRED" || termType === "RISK" || containsAny(normalized, negativeHints)) {
    polarity = "NEGATIVE";
  } else if (termType === "DESIRED" || termType === "BENEFIT" || termType === "TRUST" || containsAny(normalized, positiveHints)) {
    polarity = "POSITIVE";
  } else if (termType === "COMPETITOR") {
    polarity = "NEUTRAL";
  }

  return { termType, polarity };
}

function containsAny(value: string, hints: string[]) {
  return hints.some((hint) => value.includes(hint));
}

