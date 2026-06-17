/**
 * Demo snapshot seed.
 *
 * Populates the demo project with a completed diagnosis run so the flagship
 * customer surfaces (Overview / Nebula / Opportunities / Report) render with
 * rich, believable data without needing a live AI provider.
 *
 * Idempotent: it clears previously generated demo data for the project, then
 * recreates it. Run after `npm run db:seed` via `npm run db:seed:demo`.
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { differenceInDifferences } from "../src/server/analysis/causal-statistics";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const PROJECT_ID = "demo-project-cip";
const SUBJECT_NAME = "Cognition Intelligence Platform";

type TermSpec = {
  term: string;
  termType: string;
  polarity?: "POSITIVE" | "NEGATIVE" | "NEUTRAL" | "MIXED" | "UNKNOWN";
  gravity: number; // 0-100
  confidence: number; // 0-100
  context?: { competitorContext?: boolean; riskContext?: boolean; missingDesired?: boolean };
  excerpt: string;
  question: string;
};

const TERMS: TermSpec[] = [
  // Positive / benefit / trust — the strongest semantic field
  { term: "AI answer observability", termType: "BENEFIT", polarity: "POSITIVE", gravity: 96, confidence: 92, excerpt: "Cognition Intelligence Platform is described as an AI answer observability tool that samples how models answer about a brand.", question: "What does Cognition Intelligence Platform do?" },
  { term: "evidence-backed audit", termType: "TRUST", polarity: "POSITIVE", gravity: 91, confidence: 89, excerpt: "It produces evidence-backed audits, storing the raw AI responses behind every score.", question: "How does CIP justify its scores?" },
  { term: "semantic visibility", termType: "BENEFIT", polarity: "POSITIVE", gravity: 88, confidence: 84, excerpt: "Teams use it to track semantic visibility — which concepts AI associates with their brand.", question: "How do I measure AI visibility?" },
  { term: "citation tracking", termType: "FUNCTIONAL", polarity: "POSITIVE", gravity: 82, confidence: 80, excerpt: "The platform tracks which sources AI models cite when recommending a category.", question: "Can it track AI citations?" },
  { term: "answer sampling", termType: "FUNCTIONAL", polarity: "POSITIVE", gravity: 79, confidence: 83, excerpt: "Systematic answer sampling across many prompts gives statistically meaningful coverage.", question: "How does CIP collect data?" },
  { term: "competitor comparison", termType: "SCENARIO", polarity: "POSITIVE", gravity: 76, confidence: 78, excerpt: "It compares how often you appear versus competitors in the same AI answers.", question: "How do I compare against competitors in AI?" },
  { term: "actionable insights", termType: "POSITIVE", polarity: "POSITIVE", gravity: 71, confidence: 72, excerpt: "Findings are framed as prioritized, actionable next steps rather than raw metrics.", question: "What do I get out of an audit?" },
  { term: "transparent methodology", termType: "TRUST", polarity: "POSITIVE", gravity: 68, confidence: 81, excerpt: "Reviewers praise its transparent methodology and the absence of black-box claims.", question: "Is CIP transparent about how it works?" },
  { term: "B2B SaaS marketing teams", termType: "AUDIENCE", polarity: "NEUTRAL", gravity: 64, confidence: 70, excerpt: "Primarily aimed at B2B SaaS marketing and content teams.", question: "Who is CIP for?" },
  { term: "content strategy teams", termType: "AUDIENCE", polarity: "NEUTRAL", gravity: 58, confidence: 66, excerpt: "Content strategists use it to find topics AI does not yet associate with them.", question: "Who uses answer-engine optimization tools?" },

  // Scenarios
  { term: "track brand in ChatGPT", termType: "SCENARIO", polarity: "POSITIVE", gravity: 80, confidence: 77, excerpt: "A common use case is tracking how a brand is described in ChatGPT and other assistants.", question: "How is my brand described in ChatGPT?" },
  { term: "monitor AI citations", termType: "SCENARIO", polarity: "POSITIVE", gravity: 73, confidence: 75, excerpt: "Marketers monitor AI citations to protect share of recommendation.", question: "How do I monitor AI recommendations?" },
  { term: "content gap analysis", termType: "SCENARIO", polarity: "POSITIVE", gravity: 69, confidence: 71, excerpt: "Content gap analysis reveals questions where no clear brand owns the answer.", question: "Where are my AI content gaps?" },

  // Category / descriptive
  { term: "answer engine optimization", termType: "CATEGORY", polarity: "NEUTRAL", gravity: 86, confidence: 85, excerpt: "Positioned within the emerging answer engine optimization (AEO) category.", question: "What category is CIP in?" },
  { term: "generative engine optimization", termType: "CATEGORY", polarity: "NEUTRAL", gravity: 62, confidence: 60, excerpt: "Sometimes grouped with generative engine optimization (GEO) tooling.", question: "Is AEO the same as GEO?" },

  // Competitor-owned terms
  { term: "Profound", termType: "COMPETITOR", polarity: "NEUTRAL", gravity: 84, confidence: 82, context: { competitorContext: true }, excerpt: "Profound is frequently named as the category leader in AI answer monitoring.", question: "What are the best AEO tools?" },
  { term: "Peec AI", termType: "COMPETITOR", polarity: "NEUTRAL", gravity: 67, confidence: 69, context: { competitorContext: true }, excerpt: "Peec AI appears as a lighter-weight alternative for smaller teams.", question: "What alternatives exist to Profound?" },
  { term: "Semrush AI toolkit", termType: "COMPETITOR", polarity: "NEUTRAL", gravity: 61, confidence: 64, context: { competitorContext: true }, excerpt: "Semrush is mentioned as an adjacent incumbent expanding into AI search.", question: "Does Semrush do AEO?" },

  // Risk / negative
  { term: "early-stage data", termType: "RISK", polarity: "NEGATIVE", gravity: 57, confidence: 66, context: { riskContext: true }, excerpt: "Some answers caution that results rely on early-stage sampling and may shift.", question: "Is the AEO data reliable yet?" },
  { term: "limited integrations", termType: "NEGATIVE", polarity: "NEGATIVE", gravity: 52, confidence: 61, context: { riskContext: true }, excerpt: "Reviewers note limited integrations compared with established suites.", question: "What are the downsides of CIP?" },
  { term: "confused with web SEO", termType: "INCORRECT", polarity: "NEGATIVE", gravity: 48, confidence: 58, context: { riskContext: true }, excerpt: "AI sometimes incorrectly frames it as a traditional web SEO rank tracker.", question: "Is CIP just an SEO tool?" },

  // Missing / desired
  { term: "API access", termType: "MISSING", polarity: "NEUTRAL", gravity: 44, confidence: 55, context: { missingDesired: true }, excerpt: "Buyers ask for API access but it is rarely confirmed in answers.", question: "Does CIP offer an API?" },
  { term: "Slack alerts", termType: "MISSING", polarity: "NEUTRAL", gravity: 39, confidence: 52, context: { missingDesired: true }, excerpt: "Slack alerting is desired but seldom mentioned as available.", question: "Can CIP send Slack alerts?" },
  { term: "multi-language reports", termType: "MISSING", polarity: "NEUTRAL", gravity: 36, confidence: 49, context: { missingDesired: true }, excerpt: "Multi-language reporting is requested by global teams.", question: "Does CIP support multiple languages?" },
];

function buildNode(spec: TermSpec, index: number) {
  const now = Date.now();
  const components = {
    frequencyScore: clamp(spec.gravity + rand(index, 1) * 8 - 4),
    scenarioStabilityScore: clamp(spec.confidence + rand(index, 2) * 10 - 5),
    coMentionStrength: clamp(spec.gravity * 0.8 + rand(index, 3) * 14),
    sentimentWeight: spec.polarity === "NEGATIVE" ? clamp(30 + rand(index, 4) * 20) : clamp(70 + rand(index, 4) * 25),
    recommendationContextWeight: clamp(spec.gravity * 0.7 + rand(index, 5) * 16),
    evidenceConfidence: spec.confidence,
  };
  return {
    id: `node-${index}`,
    term: spec.term,
    normalizedTerm: spec.term.toLowerCase(),
    termType: spec.termType,
    polarity: spec.polarity ?? "NEUTRAL",
    semanticGravity: spec.gravity,
    proximityScore: clamp(spec.gravity * 0.6 + spec.confidence * 0.4),
    frequencyScore: components.frequencyScore,
    stabilityScore: components.scenarioStabilityScore,
    coMentionStrength: components.coMentionStrength,
    recommendationContextWeight: components.recommendationContextWeight,
    evidenceConfidence: spec.confidence,
    sourceCount: 3 + (index % 9),
    promptCount: 2 + (index % 5),
    modelCount: 1 + (index % 3),
    firstSeenAt: new Date(now - 6 * 86400000).toISOString(),
    lastSeenAt: new Date(now - (index % 4) * 86400000).toISOString(),
    components,
    examples: [
      {
        question: spec.question,
        excerpt: spec.excerpt,
        probeFamily: "brand_definition",
        scenario: spec.termType === "SCENARIO" ? spec.term : "category overview",
        provider: "OpenAI",
        model: "gpt-4.1-mini",
        createdAt: new Date(now - (index % 4) * 86400000).toISOString(),
      },
    ],
    context: {
      competitorContext: Boolean(spec.context?.competitorContext),
      riskContext: Boolean(spec.context?.riskContext),
      missingDesired: Boolean(spec.context?.missingDesired),
    },
  };
}

function buildSummary(scope: string, nodes: ReturnType<typeof buildNode>[]) {
  const byType = (pred: (n: ReturnType<typeof buildNode>) => boolean) =>
    nodes.filter(pred).sort((a, b) => b.semanticGravity - a.semanticGravity).map((n) => n.term);
  return {
    scope,
    version: "2026-06-08.v2",
    entityType: "BRAND",
    subjectName: SUBJECT_NAME,
    totalTerms: nodes.length,
    positiveGravity: avg(nodes.filter((n) => n.polarity === "POSITIVE").map((n) => n.semanticGravity)),
    negativeGravity: avg(nodes.filter((n) => n.polarity === "NEGATIVE").map((n) => n.semanticGravity)),
    missingDesiredTerms: nodes.filter((n) => n.context.missingDesired).length,
    competitorGravity: avg(nodes.filter((n) => n.context.competitorContext).map((n) => n.semanticGravity)),
    incorrectAssociationRisk: avg(nodes.filter((n) => n.context.riskContext).map((n) => n.semanticGravity)),
    strongestPositiveTerms: byType((n) => n.polarity === "POSITIVE").slice(0, 6),
    strongestNegativeTerms: byType((n) => n.polarity === "NEGATIVE" && !n.context.competitorContext).slice(0, 4),
    competitorOwnedTerms: byType((n) => n.context.competitorContext).slice(0, 4),
    missingTerms: byType((n) => n.context.missingDesired).slice(0, 4),
    riskTerms: byType((n) => n.context.riskContext && n.polarity === "NEGATIVE").slice(0, 4),
  };
}

function buildEdges(nodes: ReturnType<typeof buildNode>[]) {
  // Connect the subject core to high-gravity nodes, plus a few intra-cluster links.
  const edges = nodes
    .filter((n) => n.semanticGravity >= 55)
    .map((n) => ({
      id: `edge-subject-${n.id}`,
      source: "subject",
      target: n.id,
      edgeType: "subject_term" as const,
      weight: n.semanticGravity / 100,
      confidence: n.evidenceConfidence / 100,
      evidenceCount: n.sourceCount,
    }));
  return edges;
}

async function main() {
  const subject = await prisma.projectSubject.findFirst({
    where: { projectId: PROJECT_ID, isPrimary: true },
  });
  if (!subject) {
    throw new Error(`Demo subject not found for ${PROJECT_ID}. Run \`npm run db:seed\` first.`);
  }
  const subjectId = subject.id;

  // ---- Clean previously generated demo data (idempotent) -------------------
  await prisma.semanticNebulaSnapshot.deleteMany({ where: { projectId: PROJECT_ID } });
  await prisma.longTailOpportunitySnapshot.deleteMany({ where: { projectId: PROJECT_ID } });
  await prisma.questionTerritorySnapshot.deleteMany({ where: { projectId: PROJECT_ID } });
  await prisma.alert.deleteMany({ where: { projectId: PROJECT_ID } });
  await prisma.report.deleteMany({ where: { projectId: PROJECT_ID } });
  await prisma.citationSource.deleteMany({ where: { projectId: PROJECT_ID } });
  await prisma.semanticCoverageSnapshot.deleteMany({ where: { projectId: PROJECT_ID } });
  await prisma.entityProfile.deleteMany({ where: { projectId: PROJECT_ID } });
  await prisma.cognitionExperiment.deleteMany({ where: { projectId: PROJECT_ID } }); // cascades waves/observations/results
  await prisma.externalMetricSource.deleteMany({ where: { projectId: PROJECT_ID } }); // cascades points
  await prisma.metricSnapshot.deleteMany({ where: { projectId: PROJECT_ID } });
  await prisma.samplingRun.deleteMany({ where: { projectId: PROJECT_ID } }); // cascades responses + analyses
  await prisma.aeoQuery.deleteMany({ where: { projectId: PROJECT_ID } });
  await prisma.analysisJob.deleteMany({ where: { projectId: PROJECT_ID } });

  // ---- Queries -------------------------------------------------------------
  const querySpecs: { text: string; type: "recommendation" | "comparison" | "alternative" | "use_case" | "risk" | "best_tools" }[] = [
    { text: "What are the best AI answer monitoring tools for B2B SaaS?", type: "best_tools" },
    { text: "How can I track how ChatGPT describes my brand?", type: "use_case" },
    { text: "Cognition Intelligence Platform vs Profound — which should I pick?", type: "comparison" },
    { text: "What alternatives are there to Profound for AEO?", type: "alternative" },
    { text: "Is answer engine optimization worth investing in right now?", type: "risk" },
    { text: "Which tool gives evidence-backed AI visibility audits?", type: "recommendation" },
  ];
  const queries = [];
  for (const spec of querySpecs) {
    queries.push(
      await prisma.aeoQuery.create({
        data: {
          projectId: PROJECT_ID,
          subjectId,
          queryText: spec.text,
          queryType: spec.type,
          region: "US",
          intent: spec.type,
          confidence: 0.8,
        },
      }),
    );
  }

  // ---- Sampling run + responses -------------------------------------------
  const provider = await prisma.aIProvider.findFirst();
  const model = provider
    ? await prisma.aIModel.findFirst({ where: { providerId: provider.id } })
    : null;

  const SAMPLE_TOTAL = 24;
  const run = await prisma.samplingRun.create({
    data: {
      projectId: PROJECT_ID,
      subjectId,
      runType: "baseline",
      status: "completed",
      platforms: ["openai"],
      sampleCount: SAMPLE_TOTAL,
      sampleCountPerQuery: 4,
      selectedQueryIds: queries.map((q) => q.id),
      startedAt: new Date(Date.now() - 3600_000),
      completedAt: new Date(Date.now() - 3000_000),
    },
  });

  const answerExcerpts = [
    "The Cognition Intelligence Platform samples AI answers and shows, with stored evidence, how models describe your brand. It is most often compared with Profound.",
    "For tracking your brand inside ChatGPT, Cognition Intelligence Platform provides evidence-backed audits and competitor comparison.",
    "Profound is the best-known option, while Cognition Intelligence Platform is recommended for teams that want transparent methodology and raw response storage.",
    "Alternatives include Peec AI and Semrush's AI toolkit, but Cognition Intelligence Platform stands out for citation tracking.",
  ];

  let mentionedCount = 0;
  let recommendedCount = 0;
  let citedCount = 0;
  for (let i = 0; i < SAMPLE_TOTAL; i += 1) {
    const query = queries[i % queries.length];
    const mentioned = i % 10 !== 0; // ~90%
    const recommended = mentioned && i % 2 === 0; // ~45%
    const cited = mentioned && i % 3 === 0; // ~33%
    if (mentioned) mentionedCount += 1;
    if (recommended) recommendedCount += 1;
    if (cited) citedCount += 1;

    const response = await prisma.aIResponse.create({
      data: {
        runId: run.id,
        queryId: query.id,
        providerId: provider?.id ?? null,
        modelId: model?.id ?? null,
        platform: "openai",
        model: "gpt-4.1-mini",
        sampleIndex: i,
        region: "US",
        rawResponse: answerExcerpts[i % answerExcerpts.length],
        normalizedAnswer: answerExcerpts[i % answerExcerpts.length],
        createdAt: new Date(Date.now() - (SAMPLE_TOTAL - i) * 120_000),
        analysis: {
          create: {
            brandMentioned: mentioned,
            brandRecommended: recommended,
            brandPosition: recommended ? 1 + (i % 3) : null,
            sentiment: mentioned ? "positive" : "neutral",
            confidence: 0.7 + (i % 3) * 0.1,
          },
        },
      },
    });

    if (cited) {
      await prisma.citationSource.create({
        data: {
          projectId: PROJECT_ID,
          responseId: response.id,
          sourceUrl: "https://example.com/blog/aeo-guide",
          sourceDomain: "example.com",
          sourceTitle: "A practical guide to AI answer optimization",
          citationRank: 1,
          supportsBrand: true,
          confidence: 0.8,
        },
      });
    }
  }

  // ---- Semantic nebula snapshots ------------------------------------------
  const overallNodes = TERMS.map((spec, index) => buildNode(spec, index));
  const scopes: Record<string, ReturnType<typeof buildNode>[]> = {
    OVERALL: overallNodes,
    POSITIVE_NEGATIVE: overallNodes.filter((n) => n.polarity === "POSITIVE" || n.polarity === "NEGATIVE"),
    SCENARIO: overallNodes.filter((n) => n.termType === "SCENARIO" || n.termType === "AUDIENCE"),
    COMPETITOR: overallNodes.filter((n) => n.context.competitorContext),
    MISSING: overallNodes.filter((n) => n.context.missingDesired),
    RISK: overallNodes.filter((n) => n.context.riskContext),
  };
  for (const [scope, nodes] of Object.entries(scopes)) {
    if (nodes.length === 0) continue;
    await prisma.semanticNebulaSnapshot.create({
      data: {
        projectId: PROJECT_ID,
        subjectId,
        runId: run.id,
        scope,
        version: "2026-06-08.v2",
        nodeJson: nodes,
        edgeJson: buildEdges(nodes),
        summaryJson: buildSummary(scope, nodes),
        evidenceJson: {},
      },
    });
  }

  // An OLDER OVERALL snapshot so cognition-drift has something to diff against:
  // latest has two associations the old run lacked (emerged), the old run had a
  // risk term that has since faded, and Profound's gravity has receded.
  const olderOverall = overallNodes
    .filter((node) => node.term !== "evidence-backed audit" && node.term !== "citation tracking")
    .map((node) => (node.term === "Profound" ? { ...node, semanticGravity: 96 } : node));
  olderOverall.push(
    buildNode(
      {
        term: "unproven results",
        termType: "RISK",
        polarity: "NEGATIVE",
        gravity: 58,
        confidence: 60,
        context: { riskContext: true },
        excerpt: "Earlier answers questioned whether the results were proven.",
        question: "Does it actually work?",
      },
      99,
    ),
  );
  await prisma.semanticNebulaSnapshot.create({
    data: {
      projectId: PROJECT_ID,
      subjectId,
      runId: run.id,
      scope: "OVERALL",
      version: "2026-06-08.v2",
      nodeJson: olderOverall,
      edgeJson: buildEdges(olderOverall),
      summaryJson: buildSummary("OVERALL", olderOverall),
      evidenceJson: {},
      createdAt: new Date(Date.now() - 14 * 86400000),
    },
  });

  // ---- Long-tail opportunities --------------------------------------------
  const opportunities = [
    {
      id: "opp-1",
      question: "Which AEO tool gives evidence for every AI visibility score?",
      scenario: "Buyers evaluating transparency of AI audit tools",
      intent: "comparison",
      priority: "P0",
      difficulty: "Medium",
      longTailOccupationPotential: 88,
      competitorWeaknessScore: 74,
      answerInclusionPotential: 81,
      entityFitScore: 92,
      contentFeasibilityScore: 70,
      conversionValueScore: 84,
      occupiedByCompetitors: ["Profound"],
      missingEvidence: ["public methodology page", "sample evidence export"],
      recommendedContentAssets: ["Methodology explainer", "Sample audit report"],
      suggestedProbeQueries: ["How does CIP justify its scores?", "Is CIP transparent about how it works?"],
      evidence: [
        { excerpt: "Reviewers want to see the raw answers behind each score; few tools expose them.", reasons: ["transparency demand"], competitors: ["Profound"] },
      ],
    },
    {
      id: "opp-2",
      question: "How do I track my brand across ChatGPT, Gemini and Perplexity?",
      scenario: "Multi-assistant brand monitoring",
      intent: "use_case",
      priority: "P1",
      difficulty: "Medium",
      longTailOccupationPotential: 81,
      competitorWeaknessScore: 58,
      answerInclusionPotential: 76,
      entityFitScore: 85,
      contentFeasibilityScore: 66,
      conversionValueScore: 72,
      occupiedByCompetitors: ["Profound", "Peec AI"],
      missingEvidence: ["multi-provider coverage page"],
      recommendedContentAssets: ["Provider coverage matrix", "Setup guide"],
      suggestedProbeQueries: ["How is my brand described in ChatGPT?"],
      evidence: [{ excerpt: "Teams ask which assistants are covered before committing.", competitors: ["Profound"] }],
    },
    {
      id: "opp-3",
      question: "What is answer engine optimization and is it worth it in 2026?",
      scenario: "Category education for first-time buyers",
      intent: "education",
      priority: "P1",
      difficulty: "Low",
      longTailOccupationPotential: 74,
      competitorWeaknessScore: 66,
      answerInclusionPotential: 69,
      entityFitScore: 78,
      contentFeasibilityScore: 88,
      conversionValueScore: 61,
      occupiedByCompetitors: ["Semrush AI toolkit"],
      missingEvidence: ["category explainer", "ROI case study"],
      recommendedContentAssets: ["AEO 101 guide", "ROI calculator"],
      suggestedProbeQueries: ["Is answer-engine optimization worth investing in right now?"],
      evidence: [{ excerpt: "First-time buyers need the category explained before comparing tools." }],
    },
    {
      id: "opp-4",
      question: "Best lightweight AEO tool for a small content team?",
      scenario: "SMB content teams comparing affordable options",
      intent: "best_tools",
      priority: "P2",
      difficulty: "Low",
      longTailOccupationPotential: 63,
      competitorWeaknessScore: 49,
      answerInclusionPotential: 58,
      entityFitScore: 64,
      contentFeasibilityScore: 90,
      conversionValueScore: 55,
      occupiedByCompetitors: ["Peec AI"],
      missingEvidence: ["pricing page", "small-team plan"],
      recommendedContentAssets: ["Pricing & plans page", "Small-team quickstart"],
      suggestedProbeQueries: ["What alternatives exist to Profound?"],
      evidence: [{ excerpt: "Smaller teams compare on price and ease of setup.", competitors: ["Peec AI"] }],
    },
  ];
  await prisma.longTailOpportunitySnapshot.create({
    data: {
      projectId: PROJECT_ID,
      subjectId,
      runId: run.id,
      version: "2026-06-08.v2",
      opportunityJson: opportunities,
      summaryJson: {
        totalOpportunities: opportunities.length,
        highLopOpportunities: opportunities.filter((o) => o.longTailOccupationPotential >= 75).length,
        p0Opportunities: opportunities.filter((o) => o.priority === "P0").length,
        lowCompetitionOpportunities: opportunities.filter((o) => o.competitorWeaknessScore >= 60).length,
        contentReadyOpportunities: opportunities.filter((o) => o.contentFeasibilityScore >= 80).length,
        averageLop: avg(opportunities.map((o) => o.longTailOccupationPotential)),
      },
    },
  });

  // ---- Question territory --------------------------------------------------
  const territory = opportunities.map((o, index) => {
    const competitorDominance = o.occupiedByCompetitors.length > 1 ? 0.72 : o.occupiedByCompetitors.length === 1 ? 0.46 : 0.2;
    const winnerType = competitorDominance >= 0.65 ? "COMPETITOR" : o.longTailOccupationPotential >= 80 ? "TARGET" : "NO_CLEAR_WINNER";
    return {
      id: `terr-${index}`,
      question: o.question,
      cluster: o.scenario,
      scenario: o.scenario,
      intent: o.intent,
      winnerType,
      answerInclusionRate: clamp01(0.28 + index * 0.13),
      recommendationSlotRate: clamp01(0.22 + index * 0.1),
      competitorDominance,
      noClearWinnerRate: clamp01(0.5 - index * 0.08),
      opportunityScore: o.longTailOccupationPotential,
      difficulty: o.difficulty,
      priority: o.priority,
      topCompetitors: o.occupiedByCompetitors,
      reasonOwnership: o.occupiedByCompetitors.length
        ? [`${o.occupiedByCompetitors[0]} appears first in most answers for this cluster.`]
        : ["No brand consistently owns this question yet."],
      evidence: o.evidence.map((e) => ({ excerpt: e.excerpt })),
    };
  });
  await prisma.questionTerritorySnapshot.create({
    data: {
      projectId: PROJECT_ID,
      subjectId,
      runId: run.id,
      version: "2026-06-08.v2",
      territoryJson: territory,
      summaryJson: {
        totalClusters: territory.length,
        targetOwned: territory.filter((t) => t.winnerType === "TARGET").length,
        competitorOwned: territory.filter((t) => t.winnerType === "COMPETITOR").length,
        noClearWinner: territory.filter((t) => t.winnerType === "NO_CLEAR_WINNER").length,
        highOpportunity: territory.filter((t) => t.opportunityScore >= 75).length,
        lowValue: territory.filter((t) => t.opportunityScore < 65).length,
      },
    },
  });

  // ---- Alerts --------------------------------------------------------------
  await prisma.alert.createMany({
    data: [
      {
        projectId: PROJECT_ID,
        alertType: "competitor_jump",
        severity: "P2",
        status: "open",
        title: "Profound owns the leading recommendation",
        message: "Profound is named first in 42% of best-tools answers; the brand trails on the category-leader question.",
        confidence: 0.82,
      },
      {
        projectId: PROJECT_ID,
        alertType: "entity_confusion",
        severity: "P2",
        status: "open",
        title: "Occasionally framed as a traditional SEO tool",
        message: "Some answers mislabel the platform as a web SEO rank tracker, diluting the AEO positioning.",
        confidence: 0.7,
      },
    ],
  });

  // ---- Entity profile + coverage ------------------------------------------
  await prisma.entityProfile.create({
    data: {
      projectId: PROJECT_ID,
      entityName: SUBJECT_NAME,
      entityType: "Company",
      aiDefinition: "An AI answer observability platform that audits how generative models describe a brand, backed by stored evidence.",
      authorityScore: 0.62,
      consistencyScore: 0.71,
      centralityScore: 0.58,
    },
  });
  await prisma.semanticCoverageSnapshot.create({
    data: {
      projectId: PROJECT_ID,
      topicBreadth: 0.68,
      topicDepth: 0.61,
      intentCoverage: 0.74,
      vocabularyDiversity: 0.66,
      overallCoverage: 0.67,
      missingConcepts: ["API access", "Slack alerts", "multi-language reports"],
    },
  });

  // ---- Report --------------------------------------------------------------
  await prisma.report.create({
    data: {
      projectId: PROJECT_ID,
      runId: run.id,
      title: "Cognition Audit — Baseline",
      status: "ready",
      snapshot: {
        cognitionSummary:
          "AI currently understands Cognition Intelligence Platform as an evidence-backed AI answer observability tool for B2B SaaS teams. Its strongest associations are observability, audits, and transparent methodology, while Profound still owns the top category-leader recommendation and a few answers mislabel it as a traditional SEO tool.",
        generatedAt: new Date().toISOString(),
      },
    },
  });

  // ---- Completed diagnosis job (drives the status panel) -------------------
  const stageHistory = [
    "DIAGNOSIS_UNDERSTANDING_ENTITY",
    "DIAGNOSIS_BUILDING_QUESTION_MAP",
    "DIAGNOSIS_SAMPLING_AI_ANSWERS",
    "DIAGNOSIS_MAPPING_SEMANTIC_FIELD",
    "DIAGNOSIS_FINDING_OPPORTUNITIES",
    "DIAGNOSIS_BUILDING_EVIDENCE_REPORT",
  ].map((stage) => ({ stage, at: new Date().toISOString() }));
  await prisma.analysisJob.create({
    data: {
      projectId: PROJECT_ID,
      runId: run.id,
      jobType: "full_diagnosis",
      queueName: "semantic.intelligence",
      traceId: `demo-trace-${Date.now()}`,
      status: "completed",
      payload: { projectId: PROJECT_ID, subjectId },
      result: { stageHistory, currentStage: null, runId: run.id },
      startedAt: new Date(Date.now() - 3600_000),
      completedAt: new Date(Date.now() - 2900_000),
    },
  });

  // ---- Proof layer: controlled experiment (difference-in-differences) ------
  const experiment = await prisma.cognitionExperiment.create({
    data: {
      projectId: PROJECT_ID,
      subjectId,
      name: "Methodology & evidence page intervention",
      hypothesis:
        "Publishing a transparent methodology page and a sample evidence export will increase how often AI recommends us for transparency questions — beyond background model drift.",
      metricKey: "mention_rate",
      status: "concluded",
    },
  });
  // Split the question set into treatment (intervention applied) and control.
  for (let i = 0; i < queries.length; i += 1) {
    await prisma.experimentQuestion.create({
      data: { experimentId: experiment.id, queryId: queries[i].id, arm: i % 2 === 0 ? "treatment" : "control" },
    });
  }
  // Baseline: both arms equal (~40%). Retest: treatment jumps to 75%, control
  // drifts to 50% (the model improved for everyone) → net lift 0.25, drift 0.10.
  const baselineWave = await prisma.experimentWave.create({
    data: {
      experimentId: experiment.id,
      waveType: "baseline",
      label: "Baseline (pre-intervention)",
      runId: run.id,
      measuredAt: new Date(Date.now() - 21 * 86400000),
      observations: {
        create: [
          { arm: "treatment", samples: 80, successes: 32 },
          { arm: "control", samples: 80, successes: 32 },
        ],
      },
    },
  });
  const retestWave = await prisma.experimentWave.create({
    data: {
      experimentId: experiment.id,
      waveType: "retest",
      label: "Retest (post-intervention, 3 weeks later)",
      measuredAt: new Date(Date.now() - 2 * 86400000),
      observations: {
        create: [
          { arm: "treatment", samples: 80, successes: 60 },
          { arm: "control", samples: 80, successes: 40 },
        ],
      },
    },
  });
  void baselineWave;
  void retestWave;
  const did = differenceInDifferences({
    treatmentPre: { successes: 32, samples: 80 },
    treatmentPost: { successes: 60, samples: 80 },
    controlPre: { successes: 32, samples: 80 },
    controlPost: { successes: 40, samples: 80 },
  });
  await prisma.experimentResult.create({
    data: {
      experimentId: experiment.id,
      metricKey: experiment.metricKey,
      treatmentPreRate: did.treatmentPreRate,
      treatmentPostRate: did.treatmentPostRate,
      controlPreRate: did.controlPreRate,
      controlPostRate: did.controlPostRate,
      treatmentDelta: did.treatmentDelta,
      controlDelta: did.controlDelta,
      netLift: did.netLift,
      zScore: did.z,
      pValue: did.pValue,
      significant: did.significant,
    },
  });

  // ---- Proof layer: real-outcome correlation (GA4-style series) ------------
  const source = await prisma.externalMetricSource.create({
    data: { projectId: PROJECT_ID, sourceType: "ga4", name: "Google Analytics 4 (AI referrals)", status: "connected", lastSyncedAt: new Date() },
  });
  const DAYS = 14;
  for (let d = 0; d < DAYS; d += 1) {
    const date = new Date(Date.UTC(2026, 5, 1 + d)); // 2026-06-01 .. 2026-06-14
    // Visibility climbs over the window; the outcome tracks visibility from ~2
    // days earlier (cognition leads referral traffic).
    const visibility = clamp01(0.42 + d * 0.03 + Math.sin(d * 1.1) * 0.02);
    const laggedVisibility = clamp01(0.42 + Math.max(0, d - 2) * 0.03 + Math.sin(Math.max(0, d - 2) * 1.1) * 0.02);
    const sessions = Math.round(180 + laggedVisibility * 900 + Math.sin(d) * 12);
    await prisma.metricSnapshot.create({
      data: {
        projectId: PROJECT_ID,
        subjectId,
        runId: run.id,
        sampleCount: SAMPLE_TOTAL,
        aiAnswerInclusionScore: visibility,
        aiVisibilityScore: visibility,
        mentionRate: visibility,
        recommendationShare: clamp01(visibility * 0.6),
        citationRate: clamp01(visibility * 0.4),
        semanticUniverseStrength: clamp01(0.5 + d * 0.02),
        stabilityScore: 0.8,
        descriptionAccuracy: 0.78,
        createdAt: date,
      },
    });
    await prisma.externalMetricPoint.create({
      data: { projectId: PROJECT_ID, sourceId: source.id, metricKey: "ai_referral_sessions", date, value: sessions },
    });
  }

  console.log(
    `Demo snapshots seeded: ${SAMPLE_TOTAL} samples (mentioned=${mentionedCount}, recommended=${recommendedCount}, cited=${citedCount}), ` +
      `${overallNodes.length} nebula terms, ${opportunities.length} opportunities. ` +
      `Proof: experiment netLift=${(did.netLift * 100).toFixed(1)}pts p=${did.pValue.toFixed(4)} sig=${did.significant}, ${DAYS}d correlation series.`,
  );
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}
function clamp01(value: number) {
  return Math.max(0, Math.min(1, Math.round(value * 100) / 100));
}
function avg(values: number[]) {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}
function rand(index: number, salt: number) {
  const v = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
