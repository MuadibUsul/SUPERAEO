import type { SemanticEvidenceItem, SemanticTermCandidate } from "@/server/semantic-nebula/types";
import { classifyTerm } from "@/server/semantic-nebula/term-classifier";
import { isUsableTerm, normalizeTerm } from "@/server/semantic-nebula/term-normalizer";

type ExtractorResponse = {
  id: string;
  runId: string;
  model: string;
  modelId?: string | null;
  persona?: string | null;
  provider?: { name: string } | null;
  normalizedAnswer?: string | null;
  rawResponse: string;
  createdAt: Date;
  query: {
    id: string;
    queryText: string;
    queryType: string;
    persona?: string | null;
    personaType?: string | null;
    intent?: string | null;
    contextMode?: string | null;
  };
  analysis?: {
    brandMentioned: boolean;
    brandRecommended: boolean;
    sentiment: string;
    matchedKeywords?: unknown;
    competitorsMentioned?: unknown;
    recommendationWinner?: string | null;
    mentionContext?: string | null;
    brandDescription?: string | null;
    possibleHallucinations?: unknown;
    rawAnalysis?: unknown;
    confidence?: number | null;
  } | null;
};

type ExtractorKeyword = {
  keyword: string;
  keywordType: string;
  targetWeight: number;
};

const stopwords = new Set([
  "about",
  "after",
  "also",
  "because",
  "before",
  "between",
  "could",
  "from",
  "have",
  "into",
  "more",
  "most",
  "only",
  "other",
  "should",
  "than",
  "that",
  "their",
  "there",
  "these",
  "this",
  "when",
  "where",
  "which",
  "with",
  "would",
]);

export function extractSemanticTermCandidates(input: {
  subjectName: string;
  subjectAliases?: string[];
  competitors: string[];
  desiredTerms: string[];
  undesiredTerms: string[];
  keywords: ExtractorKeyword[];
  responses: ExtractorResponse[];
}) {
  const candidates = new Map<string, SemanticTermCandidate>();
  const keywordTypeByTerm = new Map(input.keywords.map((keyword) => [normalizeTerm(keyword.keyword), keyword.keywordType]));
  const desiredSet = new Set(input.desiredTerms.map(normalizeTerm));

  for (const response of input.responses) {
    const answer = response.normalizedAnswer ?? response.rawResponse;
    const analysis = response.analysis;
    const baseFlags = contextFlagsForResponse(response);

    for (const keyword of input.keywords) {
      if (answerContains(answer, keyword.keyword) || includesString(analysis?.matchedKeywords, keyword.keyword)) {
        addEvidenceTerm({
          candidates,
          term: keyword.keyword,
          keywordType: keyword.keywordType,
          response,
          answer,
          subjectName: input.subjectName,
          subjectAliases: input.subjectAliases,
          competitors: input.competitors,
          desiredTerms: input.desiredTerms,
          undesiredTerms: input.undesiredTerms,
          contextFlags: baseFlags,
        });
      }
    }

    for (const term of asStringArray(analysis?.matchedKeywords)) {
      addEvidenceTerm({
        candidates,
        term,
        keywordType: keywordTypeByTerm.get(normalizeTerm(term)),
        response,
        answer,
        subjectName: input.subjectName,
        subjectAliases: input.subjectAliases,
        competitors: input.competitors,
        desiredTerms: input.desiredTerms,
        undesiredTerms: input.undesiredTerms,
        contextFlags: baseFlags,
      });
    }

    for (const term of asStringArray(analysis?.competitorsMentioned)) {
      addEvidenceTerm({
        candidates,
        term,
        keywordType: "competitor",
        response,
        answer,
        subjectName: input.subjectName,
        subjectAliases: input.subjectAliases,
        competitors: input.competitors,
        desiredTerms: input.desiredTerms,
        undesiredTerms: input.undesiredTerms,
        contextFlags: [...baseFlags, "competitor"],
      });
    }

    if (analysis?.recommendationWinner) {
      addEvidenceTerm({
        candidates,
        term: analysis.recommendationWinner,
        keywordType: input.competitors.map(normalizeTerm).includes(normalizeTerm(analysis.recommendationWinner))
          ? "competitor"
          : undefined,
        response,
        answer,
        subjectName: input.subjectName,
        subjectAliases: input.subjectAliases,
        competitors: input.competitors,
        desiredTerms: input.desiredTerms,
        undesiredTerms: input.undesiredTerms,
        contextFlags: [...baseFlags, "recommendation"],
      });
    }

    for (const hallucination of asRecordArray(analysis?.possibleHallucinations)) {
      const claim = stringValue(hallucination.claim);
      if (claim) {
        addEvidenceTerm({
          candidates,
          term: claim.slice(0, 80),
          keywordType: "risk",
          response,
          answer,
          subjectName: input.subjectName,
          subjectAliases: input.subjectAliases,
          competitors: input.competitors,
          desiredTerms: input.desiredTerms,
          undesiredTerms: input.undesiredTerms,
          contextFlags: [...baseFlags, "risk", "incorrect"],
          excerptOverride: stringValue(hallucination.reason) || claim,
        });
      }
    }

    for (const term of extractLightweightAnswerTerms(answer, input.subjectName, input.competitors)) {
      addEvidenceTerm({
        candidates,
        term,
        keywordType: keywordTypeByTerm.get(normalizeTerm(term)),
        response,
        answer,
        subjectName: input.subjectName,
        subjectAliases: input.subjectAliases,
        competitors: input.competitors,
        desiredTerms: input.desiredTerms,
        undesiredTerms: input.undesiredTerms,
        contextFlags: baseFlags,
      });
    }
  }

  for (const desiredTerm of input.desiredTerms) {
    const normalized = normalizeTerm(desiredTerm);
    if (desiredSet.has(normalized) && !candidates.has(normalized) && isUsableTerm(desiredTerm)) {
      const classification = classifyTerm({
        term: desiredTerm,
        desiredTerms: input.desiredTerms,
        undesiredTerms: input.undesiredTerms,
        competitors: input.competitors,
        contextFlags: ["missing"],
      });
      candidates.set(normalized, {
        term: desiredTerm,
        normalizedTerm: normalized,
        termType: "MISSING",
        polarity: classification.polarity === "UNKNOWN" ? "NEUTRAL" : classification.polarity,
        occurrences: 0,
        responseIds: new Set(),
        queryIds: new Set(),
        runIds: new Set(),
        modelIds: new Set(),
        promptKeys: new Set(["desired_association"]),
        scenarios: new Set(),
        personas: new Set(),
        probeFamilies: new Set(["gap_analysis"]),
        recommendationHits: 0,
        competitorContextHits: 0,
        riskContextHits: 0,
        subjectCoMentionScores: [],
        evidence: [
          {
            excerpt: "Desired association is not yet stable in the sampled observable answer space.",
            contextFlags: ["missing", "desired"],
          },
        ],
      });
    }
  }

  return Array.from(candidates.values());
}

function addEvidenceTerm(input: {
  candidates: Map<string, SemanticTermCandidate>;
  term: string;
  keywordType?: string | null;
  response: ExtractorResponse;
  answer: string;
  subjectName: string;
  subjectAliases?: string[];
  competitors: string[];
  desiredTerms: string[];
  undesiredTerms: string[];
  contextFlags: string[];
  excerptOverride?: string;
}) {
  if (!isUsableTerm(input.term)) return;
  const normalizedTerm = normalizeTerm(input.term);
  const classification = classifyTerm({
    term: input.term,
    keywordType: input.keywordType,
    competitors: input.competitors,
    desiredTerms: input.desiredTerms,
    undesiredTerms: input.undesiredTerms,
    contextFlags: input.contextFlags,
    fallbackPolarity: sentimentToPolarity(input.response.analysis?.sentiment),
  });
  const existing = input.candidates.get(normalizedTerm);
  const candidate =
    existing ??
    ({
      term: input.term.trim(),
      normalizedTerm,
      termType: classification.termType,
      polarity: classification.polarity,
      occurrences: 0,
      responseIds: new Set<string>(),
      queryIds: new Set<string>(),
      runIds: new Set<string>(),
      modelIds: new Set<string>(),
      promptKeys: new Set<string>(),
      scenarios: new Set<string>(),
      personas: new Set<string>(),
      probeFamilies: new Set<string>(),
      recommendationHits: 0,
      competitorContextHits: 0,
      riskContextHits: 0,
      subjectCoMentionScores: [],
      evidence: [],
    } satisfies SemanticTermCandidate);

  candidate.occurrences += 1;
  candidate.responseIds.add(input.response.id);
  candidate.queryIds.add(input.response.query.id);
  candidate.runIds.add(input.response.runId);
  candidate.modelIds.add(input.response.modelId ?? input.response.model);
  candidate.promptKeys.add(input.response.query.queryType);
  candidate.scenarios.add(input.response.query.intent ?? input.response.query.queryType);
  candidate.personas.add(String(input.response.query.personaType ?? input.response.query.persona ?? input.response.persona ?? "unknown"));
  candidate.probeFamilies.add(probeFamilyFromQueryType(input.response.query.queryType));
  candidate.firstSeenAt = minDate(candidate.firstSeenAt, input.response.createdAt);
  candidate.lastSeenAt = maxDate(candidate.lastSeenAt, input.response.createdAt);

  if (input.contextFlags.includes("recommendation") || input.response.analysis?.brandRecommended) {
    candidate.recommendationHits += 1;
  }
  if (input.contextFlags.includes("competitor")) {
    candidate.competitorContextHits += 1;
  }
  if (input.contextFlags.includes("risk")) {
    candidate.riskContextHits += 1;
  }

  candidate.subjectCoMentionScores.push(
    calculateCoMentionScore(input.answer, input.term, [input.subjectName, ...(input.subjectAliases ?? [])], Boolean(input.response.analysis?.brandMentioned)),
  );
  candidate.evidence.push(buildEvidence(input, input.excerptOverride));

  input.candidates.set(normalizedTerm, candidate);
}

function buildEvidence(input: Parameters<typeof addEvidenceTerm>[0], excerptOverride?: string): SemanticEvidenceItem {
  return {
    queryId: input.response.query.id,
    responseId: input.response.id,
    runId: input.response.runId,
    question: input.response.query.queryText,
    excerpt: excerptOverride ?? excerptAroundTerm(input.answer, input.term),
    probeFamily: probeFamilyFromQueryType(input.response.query.queryType),
    queryType: input.response.query.queryType,
    scenario: input.response.query.intent,
    persona: String(input.response.query.personaType ?? input.response.query.persona ?? ""),
    provider: input.response.provider?.name ?? null,
    model: input.response.model,
    createdAt: input.response.createdAt.toISOString(),
    contextFlags: input.contextFlags,
  };
}

function contextFlagsForResponse(response: ExtractorResponse) {
  const flags: string[] = [];
  if (["recommendation", "best_tools", "buyer_decision"].includes(response.query.queryType) || response.analysis?.brandRecommended) {
    flags.push("recommendation");
  }
  if (["comparison", "alternative"].includes(response.query.queryType)) {
    flags.push("competitor");
  }
  if (["risk"].includes(response.query.queryType)) {
    flags.push("risk");
  }
  return flags;
}

function probeFamilyFromQueryType(queryType: string) {
  if (["recommendation", "best_tools", "buyer_decision"].includes(queryType)) return "recommendation_probability";
  if (["comparison", "alternative"].includes(queryType)) return "competitor_distance";
  if (queryType === "risk") return "confusion_risk";
  if (["use_case", "implementation"].includes(queryType)) return "association_structure";
  return "semantic_clarity";
}

function sentimentToPolarity(sentiment?: string | null) {
  if (sentiment === "positive") return "POSITIVE";
  if (sentiment === "negative") return "NEGATIVE";
  if (sentiment === "mixed") return "MIXED";
  if (sentiment === "neutral") return "NEUTRAL";
  return "UNKNOWN";
}

function calculateCoMentionScore(answer: string, term: string, aliases: string[], mentioned: boolean) {
  const normalizedAnswer = normalizeTerm(answer);
  const normalizedTerm = normalizeTerm(term);
  const normalizedAliases = aliases.map(normalizeTerm).filter(Boolean);
  if (!normalizedTerm || !normalizedAnswer.includes(normalizedTerm)) {
    return mentioned ? 0.35 : 0;
  }
  const sentences = answer.split(/[.!?。！？\n]+/);
  if (sentences.some((sentence) => normalizeTerm(sentence).includes(normalizedTerm) && normalizedAliases.some((alias) => normalizeTerm(sentence).includes(alias)))) {
    return 1;
  }
  const paragraphs = answer.split(/\n{2,}/);
  if (paragraphs.some((paragraph) => normalizeTerm(paragraph).includes(normalizedTerm) && normalizedAliases.some((alias) => normalizeTerm(paragraph).includes(alias)))) {
    return 0.75;
  }
  return normalizedAliases.some((alias) => normalizedAnswer.includes(alias)) || mentioned ? 0.45 : 0.15;
}

function extractLightweightAnswerTerms(answer: string, subjectName: string, competitors: string[]) {
  const lowerSubject = normalizeTerm(subjectName);
  const competitorSet = new Set(competitors.map(normalizeTerm));
  const tokens = answer
    .match(/[\p{L}\p{N}][\p{L}\p{N}\- ]{2,38}/gu)
    ?.map((token) => token.trim())
    .filter((token) => {
      const normalized = normalizeTerm(token);
      return normalized !== lowerSubject && !competitorSet.has(normalized) && !stopwords.has(normalized) && isUsableTerm(token);
    }) ?? [];

  const counts = new Map<string, { term: string; count: number }>();
  for (const token of tokens) {
    const normalized = normalizeTerm(token);
    counts.set(normalized, { term: token, count: (counts.get(normalized)?.count ?? 0) + 1 });
  }

  return Array.from(counts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
    .map((item) => item.term);
}

function excerptAroundTerm(answer: string, term: string) {
  const normalizedAnswer = answer.toLowerCase();
  const index = normalizedAnswer.indexOf(term.toLowerCase());
  if (index === -1) return answer.slice(0, 240);
  const start = Math.max(0, index - 100);
  const end = Math.min(answer.length, index + term.length + 140);
  return answer.slice(start, end).replace(/\s+/g, " ").trim();
}

function answerContains(answer: string, term: string) {
  return normalizeTerm(answer).includes(normalizeTerm(term));
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function asRecordArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object")) : [];
}

function includesString(value: unknown, term: string) {
  return asStringArray(value).some((item) => normalizeTerm(item) === normalizeTerm(term));
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function minDate(current: Date | undefined, next: Date) {
  return !current || next < current ? next : current;
}

function maxDate(current: Date | undefined, next: Date) {
  return !current || next > current ? next : current;
}
