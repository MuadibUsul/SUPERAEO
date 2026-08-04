import assert from "node:assert/strict";
import test from "node:test";

import { buildCognitionBriefViewModel } from "@/server/dashboard/cognition-brief";

test("builds a cognition brief from nebula, opportunity, and report data", () => {
  const result = buildCognitionBriefViewModel({
    locale: "en",
    subjectName: "CIP",
    metrics: {
      runId: "run-1",
      sampleCount: 24,
      entityMetrics: {
        factualAccuracy: 0,
        featureAccuracy: 0,
        authority: 0,
        identityConfusionRisk: 0,
        parameterErrorRate: 0,
        accuracyScore: 0,
      },
      modelBreakdown: [],
      metrics: {
        aiVisibilityScore: 0.61,
        citationRate: 0.4,
        mentionRate: 0.55,
        recommendationShare: 0.35,
        aiImpressionShare: 0.55,
        entityVisibility: 0.5,
        semanticCoverage: 0.72,
        stabilityIndex: 0.68,
        hallucinationRiskScore: 0.12,
        competitorDelta: 0,
      },
      confidence: {
        mentionRate: { estimate: 0.55, lowerBound: 0.4, upperBound: 0.7 },
        citationRate: { estimate: 0.4, lowerBound: 0.24, upperBound: 0.56 },
        recommendationShare: { estimate: 0.35, lowerBound: 0.2, upperBound: 0.48 },
      },
    },
    nebulaSummary: {
      totalTerms: 80,
      strongestPositiveTerms: ["AI visibility", "diagnosis"],
      strongestNegativeTerms: ["confusion risk"],
      competitorOwnedTerms: ["Similarweb"],
      missingTerms: ["trusted benchmark"],
    },
    opportunitySummary: {
      totalOpportunities: 10,
      highLopOpportunities: 4,
    },
    opportunityItems: [
      {
        id: "opp-1",
        question: "How can a SaaS site check AI recommendation visibility?",
        scenario: "AI visibility diagnosis",
        priority: "P0",
        longTailOccupationPotential: 82,
      },
    ],
    reportSnapshot: {
      cognitionSummary:
        "AI currently sees CIP as an AI visibility diagnosis platform, but it still needs stronger trust evidence.",
    },
    alerts: [{ title: "Thin citations", message: "Citation support is still weak.", severity: "P2" }],
  });

  assert.equal(result.summary.headline.includes("AI currently sees CIP"), true);
  assert.equal(result.summary.evidenceLevel, "Growing evidence");
  assert.equal(result.scores.length, 6);
  assert.equal(result.highlights[0].items[0], "AI visibility");
  assert.equal(result.opportunities[0].priority, "P0");
  assert.equal(result.risks[0].severity, "P2");
  assert.equal(result.nextActions.length, 3);
});

test("returns explainable empty states when evidence is missing", () => {
  const result = buildCognitionBriefViewModel({
    locale: "en",
    subjectName: "New Entity",
    metrics: {
      runId: null,
      sampleCount: 0,
      entityMetrics: {
        factualAccuracy: 0,
        featureAccuracy: 0,
        authority: 0,
        identityConfusionRisk: 0,
        parameterErrorRate: 0,
        accuracyScore: 0,
      },
      modelBreakdown: [],
      metrics: {
        aiVisibilityScore: 0,
        citationRate: 0,
        mentionRate: 0,
        recommendationShare: 0,
        aiImpressionShare: 0,
        entityVisibility: 0,
        semanticCoverage: 0,
        stabilityIndex: 0,
        hallucinationRiskScore: 0,
        competitorDelta: 0,
      },
      confidence: {
        mentionRate: { estimate: 0, lowerBound: 0, upperBound: 0 },
        citationRate: { estimate: 0, lowerBound: 0, upperBound: 0 },
        recommendationShare: { estimate: 0, lowerBound: 0, upperBound: 0 },
      },
    },
    nebulaSummary: {},
    opportunitySummary: {},
    opportunityItems: [],
    reportSnapshot: {},
    alerts: [],
  });

  assert.equal(result.hasEvidence, false);
  assert.equal(result.summary.headline.includes("New Entity"), true);
  assert.equal(result.scores.every((score) => score.value === null), true);
  assert.equal(result.opportunities.length, 0);
  assert.equal(result.nextActions[0].includes("Run a fresh audit sample"), true);
});
