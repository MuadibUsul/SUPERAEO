import type { ProbeDepthLevel, ProbeQuestionType, ProbeZone, SeedPool, SemanticTemperature } from "@/server/brand-probes/types";

import { probeDepthLevels } from "@/server/brand-probes/types";
import type { EntityType } from "@/server/entity/entity-profiles";

type Lang = "zh" | "en";

// Probe wording follows the subject's input language (zh-CN → Chinese, anything
// else → English) so an English brand is sampled in English, not Chinese.
function resolveLang(language: string): Lang {
  return language.toLowerCase().startsWith("zh") ? "zh" : "en";
}

function schemaInstruction(lang: Lang) {
  return lang === "zh"
    ? [
        "只输出 JSON，不要输出自然语言解释。",
        "reason_tags 必须是短词，不要句子。",
        "keywords 最多 10 个，competitors/scenarios/audiences/risk_words/opportunity_words 最多 5 个。",
        "无法判断时使用空数组或 null，不要编造长篇理由。",
      ].join("\n")
    : [
        "Output JSON only — no natural-language explanation.",
        "reason_tags must be short keywords, not sentences.",
        "keywords: max 10; competitors/scenarios/audiences/risk_words/opportunity_words: max 5 each.",
        "When unsure, use an empty array or null — do not fabricate long reasons.",
      ].join("\n");
}

// Distinct primes per variable so each dimension advances independently as the
// seed increases — this turns a few small pools into a large combinatorial space
// (breadth) instead of moving every variable in lockstep.
const STRIDE = {
  scenario: 1,
  audience: 7,
  intent: 13,
  risk: 5,
  opportunity: 11,
  warm: 17,
  cold: 19,
  competitor: 3,
  depth: 23,
} as const;

export type RenderInput = {
  brand: string;
  language: string;
  pool: SeedPool;
  zone: ProbeZone;
  questionType: ProbeQuestionType;
  /** Subject type — drives type-specific question wording. */
  entityType: EntityType;
  /** Monotonic seed; decoupled per-variable so combinations spread out. */
  index: number;
};

export type RenderOutput = {
  /** Full prompt sent to the model (core + schema instruction). */
  prompt: string;
  /** The varying core question only — used for de-duplication. */
  corePrompt: string;
  depthLevel: ProbeDepthLevel;
  variables: Record<string, unknown>;
};

export function renderProbePrompt(input: RenderInput): RenderOutput {
  const seed = input.index;
  const scenario = spread(input.pool.scenarios, seed, STRIDE.scenario);
  const audience = spread(input.pool.audiences, seed, STRIDE.audience);
  const intent = spread(input.pool.intents, seed, STRIDE.intent);
  const risk = spread(input.pool.risks, seed, STRIDE.risk);
  const opportunity = spread(input.pool.opportunities, seed, STRIDE.opportunity);
  const warm = spread(input.pool.warmTerms, seed, STRIDE.warm);
  const cold = spread(input.pool.coldTerms, seed, STRIDE.cold);
  const competitors = competitorSet(input.pool, seed);
  // Calibration/risk stay shallow on purpose; other zones cycle through depth
  // levels so the same scenario is probed at different cognitive depths (深度).
  const depthLevel =
    input.zone === "calibration"
      ? "primary"
      : probeDepthLevels[(seed * STRIDE.depth) % probeDepthLevels.length];

  const lang = resolveLang(input.language);
  const variables = { brand: input.brand, scenario, audience, intent, risk, opportunity, warm, cold, competitors, depthLevel, entityType: input.entityType };
  const corePrompt = buildPrompt(input.entityType, input.questionType, variables, depthLevel, lang);
  const fields = "probe_id, mentioned_brand, recommended_brands, keywords, competitors, scenarios, audiences, risk_words, opportunity_words, sentiment_score, recommendation_score, confidence";
  const fieldsLine = lang === "zh" ? `统一输出字段：${fields}。` : `Output these fields: ${fields}.`;

  return {
    prompt: `${corePrompt}\n\n${fieldsLine}\n${schemaInstruction(lang)}`,
    corePrompt,
    depthLevel,
    variables,
  };
}

export function semanticTemperatureForZone(zone: ProbeZone, index: number): SemanticTemperature {
  if (zone === "risk_boundary" || zone === "calibration") return "cold";
  if (zone === "growth_opportunity" || index % 3 === 1) return "warm";
  return "hot";
}

type PromptVars = {
  brand: string;
  scenario: string;
  audience: string;
  intent: string;
  risk: string;
  opportunity: string;
  cold: string;
  competitors: string;
};

function buildPrompt(entityType: EntityType, questionType: ProbeQuestionType, variables: Record<string, unknown>, depth: ProbeDepthLevel, lang: Lang) {
  const join = lang === "zh" ? "、" : ", ";
  const v: PromptVars = {
    brand: String(variables.brand),
    scenario: String(variables.scenario),
    audience: String(variables.audience),
    intent: String(variables.intent),
    risk: String(variables.risk),
    opportunity: String(variables.opportunity),
    cold: String(variables.cold),
    competitors: Array.isArray(variables.competitors) ? variables.competitors.join(join) : "",
  };
  const builder =
    entityType === "PERSON" ? personBase : entityType === "WEBSITE" ? websiteBase : entityType === "PRODUCT" ? productBase : brandBase;
  return `${builder(questionType, v, lang)}${depthClause(depth, questionType, lang)}`;
}

function brandBase(q: ProbeQuestionType, v: PromptVars, lang: Lang): string {
  if (lang === "zh") {
    switch (q) {
      case "explicit_association":
        return `提到「${v.brand}」，你首先想到的 10 个关键词、相关场景、可能竞品和风险词是什么？`;
      case "implicit_recommendation":
        return `${v.audience} 在「${v.scenario}」中想要「${v.intent}」的选择。请推荐 5 个品牌或产品。注意：不要因为题目暗示而输出固定品牌，只按真实适配度判断。`;
      case "competitor_ranking":
        return `在「${v.scenario}」场景下，${v.brand}、${v.competitors} 哪些更适合？请按推荐顺序输出品牌、分数和短理由标签。`;
      case "scenario_fit":
        return `用户处于「${v.scenario}」场景，核心需求是「${v.intent}」。${v.brand} 是否适合？同时给出可替代推荐。`;
      case "audience_fit":
        return `对于「${v.audience}」，在「${v.scenario}」中选择时，${v.brand} 是否合适？输出推荐分数、人群适配标签和风险标签。`;
      case "risk_boundary":
        return `用户关注「${v.risk}」，正在选择日常消费品牌。请推荐更合适的选择，并判断普通「${v.brand}」是否应该被推荐。`;
      case "growth_opportunity":
        return `${v.audience} 想要「${v.opportunity}」且关注「${v.intent}」。请推荐几个品牌，并输出机会标签、场景标签和推荐理由短词。`;
      default:
        return `用户需要明显不优先考虑知名度、只考虑「${v.cold}」和场景匹配度的推荐。请推荐 5 个选择，并判断 ${v.brand} 是否仍被错误推荐。`;
    }
  }
  switch (q) {
    case "explicit_association":
      return `When you hear "${v.brand}", what are the first 10 keywords, related scenarios, likely competitors, and risk terms that come to mind?`;
    case "implicit_recommendation":
      return `${v.audience} in "${v.scenario}" wants "${v.intent}". Recommend 5 brands or products. Do not output a fixed brand because of any hint in the question — judge only by real fit.`;
    case "competitor_ranking":
      return `In the "${v.scenario}" scenario, which of ${v.brand}, ${v.competitors} fit best? Output brands in recommended order with a score and short reason tags.`;
    case "scenario_fit":
      return `The user is in the "${v.scenario}" scenario; their core need is "${v.intent}". Is ${v.brand} a fit? Also give alternative recommendations.`;
    case "audience_fit":
      return `For "${v.audience}" choosing in "${v.scenario}", is ${v.brand} suitable? Output a recommendation score, audience-fit tags, and risk tags.`;
    case "risk_boundary":
      return `The user cares about "${v.risk}" while choosing an everyday brand. Recommend better options, and judge whether ${v.brand} should be recommended at all.`;
    case "growth_opportunity":
      return `${v.audience} wants "${v.opportunity}" and cares about "${v.intent}". Recommend a few brands and output opportunity tags, scenario tags, and short reason tags.`;
    default:
      return `The user explicitly does NOT prioritize fame — only "${v.cold}" and scenario fit. Recommend 5 options and judge whether ${v.brand} is still wrongly recommended.`;
  }
}

function personBase(q: ProbeQuestionType, v: PromptVars, lang: Lang): string {
  if (lang === "zh") {
    switch (q) {
      case "explicit_association":
        return `提到「${v.brand}」这个人，你会想到的领域、成就、代表作品，以及可能的误解或过时印象有哪些？`;
      case "implicit_recommendation":
        return `${v.audience} 在「${v.scenario}」中想找「${v.intent}」方面的专家或权威，你会推荐哪 5 位？只按真实专业度判断，不要受题目暗示。`;
      case "competitor_ranking":
        return `在相关领域里，${v.brand} 与 ${v.competitors} 谁更权威、更值得引用？按推荐顺序输出人名、分数和短理由标签。`;
      case "scenario_fit":
        return `针对「${v.scenario}」、需求是「${v.intent}」时，${v.brand} 是否是合适的人选？同时给出其他可推荐的专家。`;
      case "audience_fit":
        return `对于「${v.audience}」，${v.brand} 是否是合适的专家人选？输出推荐分数、适配标签和风险标签。`;
      case "risk_boundary":
        return `关于「${v.brand}」，请判断常见说法是否属实、是否可能与同名的其他人混淆。指出不确定或可能错误的事实，并给出更可靠的同领域人选。`;
      case "growth_opportunity":
        return `${v.audience} 想了解「${v.opportunity}」相关的专家观点，你会推荐谁？输出机会标签、领域标签和推荐理由短词。`;
      default:
        return `只看「${v.cold}」、不看知名度时，推荐这个领域的 5 位人选，并判断 ${v.brand} 是否仍被错误推荐为专家。`;
    }
  }
  switch (q) {
    case "explicit_association":
      return `When you think of the person "${v.brand}", what fields, achievements, notable work, and any misconceptions or outdated impressions come to mind?`;
    case "implicit_recommendation":
      // No name — measures unprompted recall as an expert.
      return `${v.audience} in "${v.scenario}" want an expert/authority on "${v.intent}". Who are the 5 people you'd recommend? Judge only by real expertise; don't be swayed by the question.`;
    case "competitor_ranking":
      return `In this field, who is more authoritative and citation-worthy — ${v.brand} or ${v.competitors}? Output names in recommended order with a score and short reason tags.`;
    case "scenario_fit":
      return `For "${v.scenario}" with the need "${v.intent}", is ${v.brand} a suitable person? Also recommend other experts.`;
    case "audience_fit":
      return `For "${v.audience}", is ${v.brand} a suitable expert? Output a recommendation score, fit tags, and risk tags.`;
    case "risk_boundary":
      // Factual accuracy / identity disambiguation — the key person risk.
      return `For "${v.brand}", judge whether common claims are true and whether they might be confused with a same-name person. Flag uncertain or likely-wrong facts, and suggest more reliable people in the field.`;
    case "growth_opportunity":
      return `${v.audience} want expert views on "${v.opportunity}". Who would you recommend? Output opportunity tags, field tags, and short reason tags.`;
    default:
      return `Considering only "${v.cold}" and not fame, recommend 5 people in this field, and judge whether ${v.brand} is still wrongly recommended as an expert.`;
  }
}

function websiteBase(q: ProbeQuestionType, v: PromptVars, lang: Lang): string {
  if (lang === "zh") {
    switch (q) {
      case "explicit_association":
        return `提到「${v.brand}」这个网站，你会想到它覆盖的主题、内容类型、可信度，以及可能的误解有哪些？`;
      case "implicit_recommendation":
        return `${v.audience} 想找「${v.intent}」相关的可信资料或来源，你会引用或推荐哪 5 个网站/资料？只按可信度与相关性判断，不要受题目暗示。`;
      case "competitor_ranking":
        return `查询「${v.scenario}」时，${v.brand} 与 ${v.competitors} 哪些更值得作为来源被引用？按可信顺序输出来源、分数和短理由标签。`;
      case "scenario_fit":
        return `当用户想了解「${v.scenario}」、需求是「${v.intent}」时，${v.brand} 是否是合适的参考来源？同时给出其他来源。`;
      case "audience_fit":
        return `对于「${v.audience}」，${v.brand} 是否是合适的参考来源？输出可信分数、适配标签和风险标签。`;
      case "risk_boundary":
        return `用户关注「${v.risk}」，在选择信息来源时，${v.brand} 是否可靠、是否存在过时或不准确的内容？请给出更可信的来源。`;
      case "growth_opportunity":
        return `${v.audience} 想找「${v.opportunity}」主题的资料，你会引用哪些来源？输出主题标签和推荐理由短词。`;
      default:
        return `只看「${v.cold}」相关性、不看知名度时，推荐 5 个来源，并判断 ${v.brand} 是否仍被错误引用。`;
    }
  }
  switch (q) {
    case "explicit_association":
      return `When you think of the website "${v.brand}", what topics it covers, content types, credibility, and any misconceptions come to mind?`;
    case "implicit_recommendation":
      // Source inclusion — no site name.
      return `${v.audience} want trustworthy material/sources on "${v.intent}". Which 5 websites/resources would you cite or recommend? Judge only by credibility and relevance; don't be swayed by the question.`;
    case "competitor_ranking":
      return `When answering "${v.scenario}", which are more worth citing as a source — ${v.brand} or ${v.competitors}? Output sources in trust order with a score and short reason tags.`;
    case "scenario_fit":
      return `When a user wants to learn about "${v.scenario}" with the need "${v.intent}", is ${v.brand} a suitable reference source? Also give other sources.`;
    case "audience_fit":
      return `For "${v.audience}", is ${v.brand} a suitable reference source? Output a trust score, fit tags, and risk tags.`;
    case "risk_boundary":
      return `The user cares about "${v.risk}" when choosing sources. Is ${v.brand} reliable, or does it have outdated/inaccurate content? Give more trustworthy sources.`;
    case "growth_opportunity":
      return `${v.audience} want material on "${v.opportunity}". Which sources would you cite? Output topic tags and short reason tags.`;
    default:
      return `Considering only relevance to "${v.cold}" and not fame, recommend 5 sources, and judge whether ${v.brand} is still wrongly cited.`;
  }
}

function productBase(q: ProbeQuestionType, v: PromptVars, lang: Lang): string {
  if (lang === "zh") {
    switch (q) {
      case "explicit_association":
        return `提到「${v.brand}」这个产品，你会想到的使用场景、核心特性、优点和潜在缺点有哪些？`;
      case "implicit_recommendation":
        return `${v.audience} 在「${v.scenario}」中想要「${v.intent}」，你会推荐哪 5 款产品？只按真实适配度判断，不要受题目暗示。`;
      case "competitor_ranking":
        return `在「${v.scenario}」场景下，${v.brand} 与 ${v.competitors} 哪款更适合？按推荐顺序输出产品、分数和短理由标签。`;
      case "scenario_fit":
        return `用户的使用场景是「${v.scenario}」，核心需求「${v.intent}」。${v.brand} 是否适合这个用途？同时给出可替代产品。`;
      case "audience_fit":
        return `对于「${v.audience}」，在「${v.scenario}」中，${v.brand} 是否合适？输出推荐分数、人群适配标签和风险标签。`;
      case "risk_boundary":
        return `关于「${v.brand}」的特性/参数，常见说法是否准确？请指出可能被夸大或说错的地方，并判断它是否仍值得推荐。`;
      case "growth_opportunity":
        return `${v.audience} 想要「${v.opportunity}」且关注「${v.intent}」，你会推荐哪些产品？输出机会标签、场景标签和推荐理由短词。`;
      default:
        return `只看「${v.cold}」与场景匹配、不看品牌知名度时，推荐 5 款产品，并判断 ${v.brand} 是否仍被错误推荐。`;
    }
  }
  switch (q) {
    case "explicit_association":
      return `When you think of the product "${v.brand}", what use-cases, core features, pros, and potential cons come to mind?`;
    case "implicit_recommendation":
      return `${v.audience} in "${v.scenario}" want "${v.intent}". Which 5 products would you recommend? Judge only by real fit; don't be swayed by the question.`;
    case "competitor_ranking":
      return `In the "${v.scenario}" scenario, which is more suitable — ${v.brand} or ${v.competitors}? Output products in recommended order with a score and short reason tags.`;
    case "scenario_fit":
      return `The user's use-case is "${v.scenario}" with the core need "${v.intent}". Is ${v.brand} a fit for this purpose? Also give substitute products.`;
    case "audience_fit":
      return `For "${v.audience}" in "${v.scenario}", is ${v.brand} suitable? Output a recommendation score, audience-fit tags, and risk tags.`;
    case "risk_boundary":
      // Feature/spec accuracy — the key product risk.
      return `For "${v.brand}"'s features/specs, are the common claims accurate? Flag anything likely exaggerated or wrong, and judge whether it's still worth recommending.`;
    case "growth_opportunity":
      return `${v.audience} want "${v.opportunity}" and care about "${v.intent}". Which products would you recommend? Output opportunity tags, scenario tags, and short reason tags.`;
    default:
      return `Considering only "${v.cold}" and scenario fit, not brand fame, recommend 5 products, and judge whether ${v.brand} is still wrongly recommended.`;
  }
}

// Depth deepens the same question along a real cognitive axis without naming the
// brand (so implicit_recommendation stays unbiased).
function depthClause(depth: ProbeDepthLevel, questionType: ProbeQuestionType, lang: Lang): string {
  if (depth === "primary") return "";
  if (lang === "zh") {
    if (depth === "rationale") return " 并为每个选择给出最关键的一个理由短词。";
    if (depth === "decision") return " 假设用户马上要做最终决定，请只保留最值得选的并排序。";
    if (questionType === "explicit_association") return " 再补充：哪些联想是误解或过时的？";
    return " 请同时说明排名第一与第二之间最重要的差异（用短词）。";
  }
  if (depth === "rationale") return " For each pick, add the single most important reason (a short tag).";
  if (depth === "decision") return " Assume the user must decide now — keep only the best pick(s) and rank them.";
  if (questionType === "explicit_association") return " Also: which associations are misconceptions or outdated?";
  return " Also state the single most important difference between the #1 and #2 picks (short tags).";
}

function competitorSet(pool: SeedPool, index: number) {
  return [
    ...rotate(pool.coreCompetitors, index).slice(0, 2),
    ...rotate(pool.adjacentCompetitors, index * 2 + 1).slice(0, 1),
    ...rotate(pool.substitutionCompetitors, index * 3 + 2).slice(0, 1),
  ].filter(Boolean);
}

function spread(values: string[], seed: number, stride: number) {
  if (!values.length) return "";
  return values[(seed * stride) % values.length];
}

function rotate(values: string[], index: number) {
  if (!values.length) return [];
  const offset = ((index % values.length) + values.length) % values.length;
  return values.slice(offset).concat(values.slice(0, offset));
}
