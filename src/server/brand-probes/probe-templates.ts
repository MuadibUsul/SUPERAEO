import type { ProbeQuestionType, ProbeZone, SeedPool, SemanticTemperature } from "@/server/brand-probes/types";

const schemaInstruction = [
  "只输出 JSON，不要输出自然语言解释。",
  "reason_tags 必须是短词，不要句子。",
  "keywords 最多 10 个，competitors/scenarios/audiences/risk_words/opportunity_words 最多 5 个。",
  "无法判断时使用空数组或 null，不要编造长篇理由。",
].join("\n");

export type RenderInput = {
  brand: string;
  language: string;
  pool: SeedPool;
  zone: ProbeZone;
  questionType: ProbeQuestionType;
  index: number;
};

export function renderProbePrompt(input: RenderInput) {
  const scenario = pick(input.pool.scenarios, input.index);
  const audience = pick(input.pool.audiences, input.index);
  const intent = pick(input.pool.intents, input.index);
  const risk = pick(input.pool.risks, input.index);
  const opportunity = pick(input.pool.opportunities, input.index);
  const warm = pick(input.pool.warmTerms, input.index);
  const cold = pick(input.pool.coldTerms, input.index);
  const competitors = competitorSet(input.pool, input.index);
  const variables = {
    brand: input.brand,
    scenario,
    audience,
    intent,
    risk,
    opportunity,
    warm,
    cold,
    competitors,
  };

  const prompt = buildPrompt(input.questionType, variables);
  return {
    prompt: `${prompt}\n\n统一输出字段：probe_id, mentioned_brand, recommended_brands, keywords, competitors, scenarios, audiences, risk_words, opportunity_words, sentiment_score, recommendation_score, confidence。\n${schemaInstruction}`,
    variables,
  };
}

export function semanticTemperatureForZone(zone: ProbeZone, index: number): SemanticTemperature {
  if (zone === "risk_boundary" || zone === "calibration") return "cold";
  if (zone === "growth_opportunity" || index % 3 === 1) return "warm";
  return "hot";
}

function buildPrompt(questionType: ProbeQuestionType, variables: Record<string, unknown>) {
  const brand = String(variables.brand);
  const scenario = String(variables.scenario);
  const audience = String(variables.audience);
  const intent = String(variables.intent);
  const risk = String(variables.risk);
  const opportunity = String(variables.opportunity);
  const competitors = Array.isArray(variables.competitors) ? variables.competitors.join("、") : "";

  if (questionType === "explicit_association") {
    return `提到「${brand}」，你首先想到的 10 个关键词、相关场景、可能竞品和风险词是什么？`;
  }
  if (questionType === "implicit_recommendation") {
    return `${audience} 在「${scenario}」中想要「${intent}」的选择。请推荐 5 个品牌或产品。注意：不要因为题目暗示而输出固定品牌，只按真实适配度判断。`;
  }
  if (questionType === "competitor_ranking") {
    return `在「${scenario}」场景下，${brand}、${competitors} 哪些更适合？请按推荐顺序输出品牌、分数和短理由标签。`;
  }
  if (questionType === "scenario_fit") {
    return `用户处于「${scenario}」场景，核心需求是「${intent}」。${brand} 是否适合？同时给出可替代推荐。`;
  }
  if (questionType === "audience_fit") {
    return `对于「${audience}」，在「${scenario}」中选择时，${brand} 是否合适？输出推荐分数、人群适配标签和风险标签。`;
  }
  if (questionType === "risk_boundary") {
    return `用户关注「${risk}」，正在选择日常消费品牌。请推荐更合适的选择，并判断普通「${brand}」是否应该被推荐。`;
  }
  if (questionType === "growth_opportunity") {
    return `${audience} 想要「${opportunity}」且关注「${intent}」。请推荐几个品牌，并输出机会标签、场景标签和推荐理由短词。`;
  }
  return `用户需要明显不优先考虑知名度、只考虑「${variables.cold}」和场景匹配度的推荐。请推荐 5 个选择，并判断 ${brand} 是否仍被错误推荐。`;
}

function competitorSet(pool: SeedPool, index: number) {
  return [
    ...rotate(pool.coreCompetitors, index).slice(0, 2),
    ...rotate(pool.adjacentCompetitors, index).slice(0, 1),
    ...rotate(pool.substitutionCompetitors, index).slice(0, 1),
  ].filter(Boolean);
}

function pick(values: string[], index: number) {
  return values.length ? values[index % values.length] : "";
}

function rotate(values: string[], index: number) {
  if (!values.length) return [];
  return values.slice(index % values.length).concat(values.slice(0, index % values.length));
}
