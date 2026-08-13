import { embedTexts, resolveEmbeddingConfig } from "@/server/ai/embeddings";
import { scoreProbeQuality } from "@/server/brand-probes/probe-quality-scorer";
import { probeResponseJsonSchema, type GeneratedProbe, type ProbeQuestionType, type ProbeZone } from "@/server/brand-probes/types";
import type { ExplorationIterationMetrics } from "@/server/analysis/semantic-exploration-metrics";
import { coverageGaps } from "@/server/analysis/semantic-exploration-metrics";
import { cosineSimilarity, lexicalVector } from "@/server/semantic-nebula/semantic-clustering";
import type { SemanticDomain } from "@/server/semantic-nebula/ontology";

export type AdaptiveProbeIntent = {
  targetDomain: SemanticDomain;
  targetType?: string;
  relationHint?: string;
  semanticDepth: number;
  question: string;
  expectedInformationGain: number;
};

export type AdaptiveProbe = GeneratedProbe & { intent: AdaptiveProbeIntent };

const domainProbeConfig: Record<SemanticDomain, { zone: ProbeZone; questionType: ProbeQuestionType; type: string; relationHint?: string }> = {
  ENTITY: { zone: "core_semantics", questionType: "explicit_association", type: "RELATED_ENTITY" },
  ATTRIBUTE: { zone: "core_semantics", questionType: "explicit_association", type: "CAPABILITY" },
  RELATION: { zone: "competition", questionType: "competitor_ranking", type: "STRUCTURAL_RELATION", relationHint: "ASSOCIATED_WITH" },
  ACTION: { zone: "core_semantics", questionType: "explicit_association", type: "ACTION" },
  EVENT: { zone: "growth_opportunity", questionType: "growth_opportunity", type: "EVENT" },
  FUNCTION: { zone: "scenario_fit", questionType: "scenario_fit", type: "USE_CASE", relationHint: "USED_FOR" },
  CONTEXT: { zone: "audience_fit", questionType: "audience_fit", type: "CONTEXT" },
  CAUSE_EFFECT: { zone: "risk_boundary", questionType: "risk_boundary", type: "CAUSE", relationHint: "CAUSES" },
  EVALUATION: { zone: "implicit_recommendation", questionType: "implicit_recommendation", type: "EVALUATION" },
  RISK_OPPORTUNITY: { zone: "risk_boundary", questionType: "risk_boundary", type: "RISK" },
  TEMPORAL: { zone: "calibration", questionType: "calibration", type: "TREND" },
  QUANTITATIVE: { zone: "calibration", questionType: "calibration", type: "METRIC" },
  EVIDENCE: { zone: "calibration", questionType: "calibration", type: "EVIDENCE" },
};

const embeddingCache = new Map<string, number[]>();

export function generateAdaptiveProbeCandidates(input: {
  subjectName: string;
  language: string;
  metrics: ExplorationIterationMetrics;
  iteration: number;
  maxSemanticDepth?: number;
}): AdaptiveProbe[] {
  const zh = input.language.toLowerCase().startsWith("zh");
  const depth = Math.min(input.maxSemanticDepth ?? 2, Math.max(0, input.iteration - 1));
  return coverageGaps(input.metrics, 8).flatMap((gap) => {
    const config = domainProbeConfig[gap.domain];
    return [0, 1].map((variant) => {
      const question = adaptiveQuestion({ subject: input.subjectName, domain: gap.domain, depth, variant, zh });
      const schemaInstruction = zh
        ? "只输出规定 JSON；semantic_units 必须按语义角色结构化，并保留否定、推测、条件、时间、数值与证据置信度。"
        : "Return the required JSON only. Structure semantic_units by semantic role and preserve negation, uncertainty, conditions, time, quantities, and evidence confidence.";
      const prompt = `${question}\n\n${schemaInstruction}`;
      const variables = {
        brand: input.subjectName,
        generationMode: "adaptive",
        iteration: input.iteration,
        semanticDomain: gap.domain,
        semanticType: config.type,
        relationHint: config.relationHint,
        semanticDepth: depth,
        expectedInformationGain: gap.priority,
        variant,
      };
      const qualityScore = scoreProbeQuality({ zone: config.zone, questionType: config.questionType, prompt, variables });
      return {
        dimension: `semantic_gap_${gap.domain.toLowerCase()}`,
        zone: config.zone,
        questionType: config.questionType,
        semanticTemperature: gap.recentNovelty > 0.1 ? "warm" : "cold",
        weight: Number(Math.min(1, 0.7 + gap.priority * 0.3).toFixed(2)),
        samplingWeight: Number(Math.min(1, gap.priority).toFixed(3)),
        measurementWeight: 0.9,
        modelTemperature: 0.3,
        language: input.language,
        prompt,
        expectedOutputSchema: probeResponseJsonSchema as unknown as Record<string, unknown>,
        variables,
        qualityScore,
        intent: {
          targetDomain: gap.domain,
          targetType: config.type,
          relationHint: config.relationHint,
          semanticDepth: depth,
          question,
          expectedInformationGain: gap.priority,
        },
      } satisfies AdaptiveProbe;
    });
  });
}

export async function selectDiverseAdaptiveProbes(input: {
  candidates: AdaptiveProbe[];
  historicalPrompts: string[];
  limit: number;
  duplicateThreshold?: number;
}) {
  const duplicateThreshold = input.duplicateThreshold ?? 0.9;
  const texts = [...input.historicalPrompts, ...input.candidates.map((candidate) => candidate.intent.question)];
  const vectors = await probeVectors(texts);
  const historical = vectors.slice(0, input.historicalPrompts.length);
  const candidates = input.candidates.map((candidate, index) => ({ candidate, vector: vectors[input.historicalPrompts.length + index] }));
  const eligible = candidates.filter(({ vector }) => historical.every((past) => cosineSimilarity(vector, past) < duplicateThreshold));
  const selected: typeof eligible = [];

  while (selected.length < input.limit && eligible.length > 0) {
    let bestIndex = 0;
    let bestScore = -Infinity;
    for (let index = 0; index < eligible.length; index += 1) {
      const item = eligible[index];
      const comparisons = [...historical, ...selected.map((entry) => entry.vector)];
      const diversity = comparisons.length ? 1 - Math.max(...comparisons.map((vector) => cosineSimilarity(item.vector, vector))) : 1;
      const intent = item.candidate.intent;
      const score = item.candidate.qualityScore * (0.4 * diversity + 0.4 * Math.min(1, intent.expectedInformationGain) + 0.2 * relevanceScore(intent.question));
      if (score > bestScore) {
        bestIndex = index;
        bestScore = score;
      }
    }
    selected.push(eligible.splice(bestIndex, 1)[0]);
  }

  return {
    selected: selected.map(({ candidate }) => candidate),
    rejectedDuplicates: candidates.length - eligible.length - selected.length,
  };
}

export function fallbackProbeSimilarity(left: string, right: string) {
  return cosineSimilarity(lexicalVector(normalizeProbeMeaning(left)), lexicalVector(normalizeProbeMeaning(right)));
}

async function probeVectors(texts: string[]) {
  const config = await resolveEmbeddingConfig().catch(() => null);
  if (config) {
    const missing = texts.filter((text) => !embeddingCache.has(`${config.model}|${normalizeProbeMeaning(text)}`));
    if (missing.length > 0) {
      const embedded = await embedTexts(missing, config).catch(() => []);
      missing.forEach((text, index) => {
        if (embedded[index]?.length) embeddingCache.set(`${config.model}|${normalizeProbeMeaning(text)}`, embedded[index]);
      });
    }
    if (texts.every((text) => embeddingCache.has(`${config.model}|${normalizeProbeMeaning(text)}`))) {
      return texts.map((text) => embeddingCache.get(`${config.model}|${normalizeProbeMeaning(text)}`)!);
    }
  }
  return texts.map((text) => lexicalVector(normalizeProbeMeaning(text)));
}

function normalizeProbeMeaning(value: string) {
  return value.normalize("NFKC").toLowerCase()
    .replace(/competitors?|competitive|compete(?:s|d|ing)?|rivals?/g, " competition ")
    .replace(/companies|company|brands?|products?/g, " ")
    .replace(/which|what|who|where|when|why|how|are|is|does|do|the|a|an|of|with|most|main|directly|direct|please/g, " ")
    .replace(/[\p{P}\p{S}\s]+/gu, " ")
    .trim();
}

function relevanceScore(question: string) {
  const lengthScore = question.length >= 12 && question.length <= 360 ? 1 : 0.6;
  return /[?？]/.test(question) ? lengthScore : lengthScore * 0.8;
}

function adaptiveQuestion(input: { subject: string; domain: SemanticDomain; depth: number; variant: number; zh: boolean }) {
  const depthHint = input.depth > 0 ? (input.zh ? `并追踪到第 ${input.depth} 层依赖或结果` : `and follow dependencies or outcomes to depth ${input.depth}`) : "";
  const zh: Record<SemanticDomain, string[]> = {
    ENTITY: [`与「${input.subject}」直接相关但尚未讨论的实体有哪些？${depthHint}`, `哪些组织、产品、技术或市场构成「${input.subject}」的外部语义邻域？${depthHint}`],
    ATTRIBUTE: [`「${input.subject}」有哪些容易被忽略的能力、状态、定位与特征？`, `从身份、能力、声誉和状态区分「${input.subject}」的关键属性是什么？`],
    RELATION: [`「${input.subject}」与供应商、客户、伙伴、监管者和替代方案之间有哪些明确关系？${depthHint}`, `哪些结构性依赖或控制关系决定「${input.subject}」的位置？${depthHint}`],
    ACTION: [`「${input.subject}」实际生产、开发、使用、供应、投资或运营什么？`, `围绕「${input.subject}」有哪些可以规范化为关系边的动作？`],
    EVENT: [`哪些已发生事件显著改变了「${input.subject}」？`, `与「${input.subject}」有关的监管、融资、发布、危机或技术突破有哪些？`],
    FUNCTION: [`「${input.subject}」解决什么问题，输入、机制和输出分别是什么？`, `在不同应用中「${input.subject}」的功能、流程与使用方式是什么？`],
    CONTEXT: [`哪些用户、场景、行业、地区或条件下「${input.subject}」的结论才成立？`, `「${input.subject}」面向谁、在什么环境和约束下使用？`],
    CAUSE_EFFECT: [`哪些因素驱动「${input.subject}」，它又会造成哪些一阶和二阶结果？${depthHint}`, `请给出关于「${input.subject}」且有明确证据的因果链，不要把共现当因果。${depthHint}`],
    EVALUATION: [`「${input.subject}」的优势、护城河、弱点、限制与声誉判断分别是什么？`, `与替代方案相比，「${input.subject}」在哪些条件下表现更好或更差？`],
    RISK_OPPORTUNITY: [`「${input.subject}」有哪些独立于弱点本身的风险、威胁、机会和白空间？${depthHint}`, `哪些未来情境会让「${input.subject}」暴露于风险或获得增长机会？${depthHint}`],
    TEMPORAL: [`「${input.subject}」的重要时间点、阶段、趋势和方向变化是什么？`, `「${input.subject}」过去、现在和预期状态有何区别？`],
    QUANTITATIVE: [`有哪些带数值、单位和时间范围的指标可以描述「${input.subject}」？`, `关于「${input.subject}」的价格、份额、增长、排名、容量或性能数据是什么？`],
    EVIDENCE: [`关于「${input.subject}」的核心主张分别由什么来源和证据支持？`, `哪些关于「${input.subject}」的说法仍缺少可靠引用或观察证据？`],
  };
  const en: Record<SemanticDomain, string[]> = {
    ENTITY: [`Which relevant entities around ${input.subject} have not yet been discussed? ${depthHint}`, `Which organizations, products, technologies, or markets form ${input.subject}'s external semantic neighborhood? ${depthHint}`],
    ATTRIBUTE: [`Which overlooked capabilities, states, positioning, and characteristics describe ${input.subject}?`, `What identity, capability, reputation, and status attributes distinguish ${input.subject}?`],
    RELATION: [`What explicit supplier, customer, partner, regulator, and alternative relationships surround ${input.subject}? ${depthHint}`, `Which structural dependencies or control relationships determine ${input.subject}'s position? ${depthHint}`],
    ACTION: [`What does ${input.subject} produce, develop, use, supply, invest in, or operate?`, `Which actions around ${input.subject} can be canonicalized as graph relations?`],
    EVENT: [`Which past events materially changed ${input.subject}?`, `Which regulatory, funding, launch, crisis, or technology events involve ${input.subject}?`],
    FUNCTION: [`What problem does ${input.subject} solve, and what are its inputs, mechanisms, and outputs?`, `How do ${input.subject}'s functions and processes differ by application?`],
    CONTEXT: [`For which users, scenarios, industries, geographies, or conditions do claims about ${input.subject} hold?`, `Who uses ${input.subject}, in what environment, and under which constraints?`],
    CAUSE_EFFECT: [`What drives ${input.subject}, and what first- and second-order outcomes does it cause? ${depthHint}`, `Give evidence-backed causal chains for ${input.subject}; do not treat co-occurrence as causation. ${depthHint}`],
    EVALUATION: [`What are ${input.subject}'s advantages, moats, weaknesses, limits, and reputation judgments?`, `Under which conditions does ${input.subject} outperform or underperform alternatives?`],
    RISK_OPPORTUNITY: [`Which risks, threats, opportunities, and white spaces around ${input.subject} are distinct from its current weaknesses? ${depthHint}`, `Which future scenarios expose ${input.subject} to risk or growth opportunities? ${depthHint}`],
    TEMPORAL: [`What milestones, periods, trends, and directional changes define ${input.subject}?`, `How do ${input.subject}'s past, current, and expected states differ?`],
    QUANTITATIVE: [`Which metrics with values, units, and time ranges describe ${input.subject}?`, `What price, share, growth, rank, capacity, or performance data exists for ${input.subject}?`],
    EVIDENCE: [`Which sources and evidence support the core claims about ${input.subject}?`, `Which claims about ${input.subject} still lack reliable citations or observational evidence?`],
  };
  return (input.zh ? zh : en)[input.domain][input.variant % 2];
}
