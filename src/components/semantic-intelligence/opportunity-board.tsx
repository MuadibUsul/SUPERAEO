"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { EvidenceDrawer } from "@/components/semantic-intelligence/evidence-drawer";

type OpportunityRow = {
  id: string;
  question: string;
  scenario: string;
  intent: string;
  entityFitScore?: number;
  competitorWeaknessScore: number;
  answerInclusionPotential: number;
  contentFeasibilityScore?: number;
  conversionValueScore?: number;
  longTailOccupationPotential: number;
  difficulty: string;
  priority: string;
  recommendedContentAssets: string[];
  occupiedByCompetitors?: string[];
  missingEvidence?: string[];
  suggestedProbeQueries?: string[];
  evidence?: { excerpt: string; reasons?: string[]; competitors?: string[] }[];
};

type OpportunityBoardLabels = {
  lanes: { p0: string; p1: string; p2: string; p3: string };
  difficulty: string;
  intent: string;
  competitorWeakness: string;
  answerInclusionPotential: string;
  questionCluster: string;
  scenario: string;
  scoreBreakdown: string;
  sourceEvidence: string;
  recommendedAssets: string;
  suggestedQueries: string;
  missingEvidence: string;
  competitors: string;
  noEvidence: string;
  whyThisExists: string;
  openDetail: string;
  close: string;
};

export function OpportunityBoard({
  opportunities,
  labels,
}: {
  opportunities: OpportunityRow[];
  labels: OpportunityBoardLabels;
}) {
  const [active, setActive] = useState<OpportunityRow | null>(null);

  return (
    <>
      <div className="grid gap-3 xl:grid-cols-4">
        {(["P0", "P1", "P2", "P3"] as const).map((priority) => {
          const laneTone =
            priority === "P0" ? "0.74 0.18 12" : priority === "P1" ? "0.85 0.15 85" : priority === "P2" ? "0.82 0.13 205" : "0.74 0.03 255";
          return (
            <div key={priority} className="panel-inset p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 font-semibold text-foreground">
                  <span className="size-2 rounded-full" style={{ background: `oklch(${laneTone})` }} />
                  {priority === "P0"
                    ? labels.lanes.p0
                    : priority === "P1"
                      ? labels.lanes.p1
                      : priority === "P2"
                        ? labels.lanes.p2
                        : labels.lanes.p3}
                </h3>
                <Badge variant="outline">
                  {opportunities.filter((item) => item.priority === priority).length}
                </Badge>
              </div>
              <div className="space-y-3">
                {opportunities
                  .filter((item) => item.priority === priority)
                  .slice(0, 8)
                  .map((opportunity) => (
                    <button
                      key={opportunity.id}
                      type="button"
                      className="block w-full rounded-lg border border-border bg-card p-3 text-left backdrop-blur transition-all hover:border-[oklch(0.82_0.13_205/35%)] hover:bg-accent"
                      onClick={() => setActive(opportunity)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <h4 className="text-sm font-medium leading-5 text-foreground">{opportunity.question}</h4>
                        <span className="font-mono text-sm font-semibold text-success">{opportunity.longTailOccupationPotential}</span>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-faint">{opportunity.scenario}</p>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                        <MiniMetric label={labels.difficulty} value={opportunity.difficulty} />
                        <MiniMetric label={labels.intent} value={opportunity.intent} />
                        <MiniMetric label={labels.competitorWeakness} value={opportunity.competitorWeaknessScore} />
                        <MiniMetric label={labels.answerInclusionPotential} value={opportunity.answerInclusionPotential} />
                      </div>
                      {opportunity.recommendedContentAssets?.length ? (
                        <p className="mt-3 text-xs leading-5 text-faint">
                          {opportunity.recommendedContentAssets.slice(0, 2).join(" / ")}
                        </p>
                      ) : null}
                    </button>
                  ))}
              </div>
            </div>
          );
        })}
      </div>

      <EvidenceDrawer
        open={Boolean(active)}
        onClose={() => setActive(null)}
        title={active?.question ?? ""}
        subtitle={active ? `${active.priority} · ${active.intent}` : undefined}
        summary={active ? `${labels.whyThisExists}: ${active.scenario}` : undefined}
        scoreTitle={labels.scoreBreakdown}
        scores={
          active
            ? [
                { label: "LOP", value: active.longTailOccupationPotential },
                { label: labels.competitorWeakness, value: active.competitorWeaknessScore },
                { label: labels.answerInclusionPotential, value: active.answerInclusionPotential },
                { label: labels.difficulty, value: active.difficulty },
                { label: "Entity Fit", value: active.entityFitScore ?? "--" },
                { label: "Content Feasibility", value: active.contentFeasibilityScore ?? "--" },
              ]
            : []
        }
        sections={
          active
            ? [
                { label: labels.recommendedAssets, items: active.recommendedContentAssets ?? [] },
                { label: labels.competitors, items: active.occupiedByCompetitors ?? [] },
                { label: labels.missingEvidence, items: active.missingEvidence ?? [] },
                { label: labels.suggestedQueries, items: active.suggestedProbeQueries ?? [] },
                { label: labels.sourceEvidence, items: (active.evidence ?? []).map((item) => item.excerpt) },
              ]
            : []
        }
        closeLabel={labels.close}
        noEvidenceLabel={labels.noEvidence}
      />
    </>
  );
}

function MiniMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="panel-inset p-2">
      <div className="text-[10px] text-faint">{label}</div>
      <div className="mt-1 font-mono text-dim">{value}</div>
    </div>
  );
}
