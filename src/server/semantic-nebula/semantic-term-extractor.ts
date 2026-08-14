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

const genericPhrases = new Set([
  "answer",
  "bottom line",
  "in conclusion",
  "key takeaway",
  "short answer",
  "the answer",
  "the short answer is",
  "there are several options",
  "\u7ed9\u4f60\u4e00\u70b9\u9009\u8d2d\u5efa\u8bae",
  "其他",
  "总结",
  "特点",
  "注意事项",
  "结论",
  "建议",
  "推荐",
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

    for (const rawTerm of asStringArray(analysis?.matchedKeywords)) {
      const term = cleanModelKeyword(rawTerm);
      if (!term) continue;
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

    for (const entity of asRecordArray(asRecord(analysis?.rawAnalysis)?.mentionedEntities)) {
      const role = stringValue(entity.role);
      if (role === "target") continue;
      const isComparison = role === "comparison";
      for (const term of splitEntityTerms(stringValue(entity.name))) {
        addEvidenceTerm({
          candidates,
          term,
          keywordType: isComparison ? "competitor" : role === "concept" ? "category" : undefined,
          response,
          answer,
          subjectName: input.subjectName,
          subjectAliases: input.subjectAliases,
          competitors: input.competitors,
          desiredTerms: input.desiredTerms,
          undesiredTerms: input.undesiredTerms,
          contextFlags: isComparison ? [...baseFlags, "competitor"] : baseFlags,
        });
      }
    }

    for (const rawTerm of asStringArray(analysis?.competitorsMentioned)) {
      for (const term of splitEntityTerms(rawTerm)) {
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
    }

    if (analysis?.recommendationWinner) {
      for (const term of splitEntityTerms(analysis.recommendationWinner)) {
        addEvidenceTerm({
          candidates,
          term,
          keywordType: input.competitors.map(normalizeTerm).includes(normalizeTerm(term)) ? "competitor" : undefined,
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
    }

    for (const hallucination of asRecordArray(analysis?.possibleHallucinations)) {
      const claim = stringValue(hallucination.claim);
      const riskTerm = constrainRiskTerm(claim, input.subjectName, input.competitors);
      if (riskTerm) {
        addEvidenceTerm({
          candidates,
          term: riskTerm,
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

    for (const term of extractConstrainedAnswerTerms(answer, input.subjectName, input.competitors)) {
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
        contextSightings: new Set(),
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
  const subjectTerms = [input.subjectName, ...(input.subjectAliases ?? [])].map(normalizeTerm);
  if (subjectTerms.includes(normalizedTerm)) return;
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
      contextSightings: new Set<string>(),
      recommendationHits: 0,
      competitorContextHits: 0,
      riskContextHits: 0,
      subjectCoMentionScores: [],
      evidence: [],
    } satisfies SemanticTermCandidate);

  const isNewResponseEvidence = !candidate.responseIds.has(input.response.id);
  if (existing && ["COMPETITOR", "RISK", "INCORRECT"].includes(classification.termType)) {
    candidate.termType = classification.termType;
    candidate.polarity = classification.polarity;
  }
  if (isNewResponseEvidence) candidate.occurrences += 1;
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

  // Each counter means "distinct responses that showed this term in that
  // context". Deduplicating per (context, response) credits a response whose
  // later extraction path adds a context the first path did not carry, without
  // double-counting one answer that names the same term twice.
  const countContext = (flag: string) => {
    const sighting = `${flag}:${input.response.id}`;
    if (candidate.contextSightings.has(sighting)) return false;
    candidate.contextSightings.add(sighting);
    return true;
  };

  if ((input.contextFlags.includes("recommendation") || input.response.analysis?.brandRecommended) && countContext("recommendation")) {
    candidate.recommendationHits += 1;
  }
  if (input.contextFlags.includes("competitor") && countContext("competitor")) {
    candidate.competitorContextHits += 1;
  }
  if (input.contextFlags.includes("risk") && countContext("risk")) {
    candidate.riskContextHits += 1;
  }

  if (isNewResponseEvidence) {
    candidate.subjectCoMentionScores.push(
      calculateCoMentionScore(input.answer, input.term, [input.subjectName, ...(input.subjectAliases ?? [])], Boolean(input.response.analysis?.brandMentioned)),
    );
    candidate.evidence.push(buildEvidence(input, input.excerptOverride));
  }

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

export function extractConstrainedAnswerTerms(answer: string, subjectName: string, competitors: string[]) {
  const lowerSubject = normalizeTerm(subjectName);
  const competitorSet = new Set(competitors.map(normalizeTerm));
  const phrases = [
    ...matchGroups(answer, /\*\*([^*\n]{2,80})\*\*/g),
    ...matchGroups(answer, /^#{1,6}\s+([^\n]{2,80})$/gm),
    ...matchGroups(answer, /^(?:[-*+]\s+|\d+[.)]\s+)?(?:\*\*)?([^:\n：]{2,48})(?:\*\*)?\s*[:：]/gm),
  ]
    .map(cleanPhrase)
    .flatMap((phrase) => phrase.split("/").map(cleanPhrase))
    .filter((phrase) => isConstrainedSemanticPhrase(phrase, lowerSubject, competitorSet));

  const counts = new Map<string, { term: string; count: number }>();
  for (const phrase of phrases) {
    const normalized = normalizeTerm(phrase);
    counts.set(normalized, { term: phrase, count: (counts.get(normalized)?.count ?? 0) + 1 });
  }

  return Array.from(counts.values())
    .sort((a, b) => b.count - a.count || a.term.length - b.term.length)
    .slice(0, 8)
    .map((item) => item.term);
}

function matchGroups(value: string, pattern: RegExp) {
  return Array.from(value.matchAll(pattern), (match) => match[1] ?? "");
}

function cleanPhrase(value: string) {
  return value
    .replace(/^[\s#>*_`'"“”‘’()[\]{}-]+|[\s#>*_`'"“”‘’()[\]{}.,!?;:，。！？；：-]+$/gu, "")
    .replace(/\s*[（(][^()（）]*[)）]\s*$/u, "")
    .replace(/\s+/g, " ")
    .replace(/[\u0022\u0027\u2018\u2019\u201c\u201d]/gu, "")
    .trim();
}

function isConstrainedSemanticPhrase(phrase: string, subject: string, competitors: Set<string>) {
  const normalized = normalizeTerm(phrase);
  if (!normalized || normalized === subject || competitors.has(normalized)) return false;
  if (stopwords.has(normalized) || genericPhrases.has(normalized) || !isUsableTerm(phrase)) return false;
  if (phrase.length > 72 || /[,.!?，。！？；;、]/u.test(phrase)) return false;

  const latinWords = phrase.match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu) ?? [];
  const containsCjk = /[\p{Script=Han}]/u.test(phrase);
  if (containsCjk && phrase.length > 18) return false;
  if (!containsCjk && (latinWords.length < 2 || latinWords.length > 6)) return false;

  const first = normalizeTerm(latinWords[0] ?? "");
  const last = normalizeTerm(latinWords.at(-1) ?? "");
  return !stopwords.has(first) && !stopwords.has(last);
}

function cleanModelKeyword(value: string) {
  const phrase = cleanPhrase(value);
  if (!phrase || genericPhrases.has(normalizeTerm(phrase)) || /[,.!?，。！？；;、/]/u.test(phrase)) return null;
  const containsCjk = /[\p{Script=Han}]/u.test(phrase);
  const wordCount = phrase.match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu)?.length ?? 0;
  if (containsCjk && phrase.length > 14) return null;
  if (!containsCjk && wordCount > 6) return null;
  return isUsableTerm(phrase) ? phrase : null;
}

function splitEntityTerms(value: string) {
  return cleanPhrase(value)
    .split(/[、,，/]/u)
    .map(cleanPhrase)
    .filter((term) => term && !genericPhrases.has(normalizeTerm(term)) && isUsableTerm(term));
}

function constrainRiskTerm(claim: string, subjectName: string, competitors: string[]) {
  const phrase = cleanPhrase(claim);
  return isConstrainedSemanticPhrase(
    phrase,
    normalizeTerm(subjectName),
    new Set(competitors.map(normalizeTerm)),
  ) ? phrase : null;
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

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
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
