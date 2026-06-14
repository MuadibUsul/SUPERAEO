"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { EvidenceDrawer } from "@/components/semantic-intelligence/evidence-drawer";

type TerritoryItem = {
  question: string;
  cluster: string;
  scenario: string;
  intent: string;
  winnerType: string;
  answerInclusionRate: number;
  recommendationSlotRate: number;
  competitorDominance: number;
  noClearWinnerRate: number;
  opportunityScore: number;
  difficulty: string;
  priority: string;
  topCompetitors: string[];
  reasonOwnership?: string[];
  evidence?: { excerpt: string }[];
};

type TerritoryLabels = {
  winner: string;
  opportunityScore: string;
  sampleQuestion: string;
  clusterList: string;
  competitorDominance: string;
  answerInclusionRate: string;
  recommendationSlotRate: string;
  noClearWinnerRate: string;
  questionCluster: string;
  scenario: string;
  scoreBreakdown: string;
  sourceEvidence: string;
  competitors: string;
  reasonOwnership: string;
  noEvidence: string;
  close: string;
  summary: string;
  quadrants: { open: string; easyWins: string; stronghold: string; lowValue: string };
};

export function QuestionTerritoryExplorer({
  territory,
  labels,
}: {
  territory: TerritoryItem[];
  labels: TerritoryLabels;
}) {
  const [active, setActive] = useState<TerritoryItem | null>(null);

  return (
    <>
      <div className="relative h-88 overflow-hidden rounded-2xl border border-border bg-[oklch(0.08_0.02_264)] cosmic-grid">
        <div className="absolute inset-x-6 bottom-6 h-px bg-border" />
        <div className="absolute bottom-6 left-6 top-6 w-px bg-border" />
        <div className="eyebrow absolute left-10 top-8 text-[oklch(0.82_0.13_205/60%)]">
          {labels.quadrants.open}
        </div>
        <div className="eyebrow absolute right-10 top-8 text-right text-[oklch(0.85_0.15_85/60%)]">
          {labels.quadrants.stronghold}
        </div>
        <div className="eyebrow absolute bottom-10 left-10 text-[oklch(0.82_0.15_162/55%)]">
          {labels.quadrants.easyWins}
        </div>
        <div className="eyebrow absolute bottom-10 right-10 text-right text-faint">
          {labels.quadrants.lowValue}
        </div>
        {territory.slice(0, 80).map((item) => {
          const x = 8 + item.competitorDominance * 82;
          const y = 88 - item.opportunityScore * 0.78;
          return (
            <button
              key={`${item.cluster}-${item.question}`}
              type="button"
              title={item.question}
              className="absolute rounded-full border border-white/50 transition hover:scale-110"
              style={{
                left: `${Math.max(8, Math.min(90, x))}%`,
                top: `${Math.max(8, Math.min(86, y))}%`,
                width: `${10 + Math.max(0, item.opportunityScore - 40) * 0.2}px`,
                height: `${10 + Math.max(0, item.opportunityScore - 40) * 0.2}px`,
                backgroundColor:
                  item.winnerType === "TARGET"
                    ? "#38bdf8"
                    : item.winnerType === "COMPETITOR"
                      ? "#f59e0b"
                      : "#8b5cf6",
                boxShadow:
                  item.winnerType === "TARGET"
                    ? "0 0 18px rgba(56,189,248,.32)"
                    : item.winnerType === "COMPETITOR"
                      ? "0 0 18px rgba(245,158,11,.28)"
                      : "0 0 18px rgba(139,92,246,.28)",
              }}
              onClick={() => setActive(item)}
            />
          );
        })}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {territory.slice(0, 12).map((item) => (
          <button
            key={`${item.cluster}-${item.question}-card`}
            type="button"
            className="rounded-lg border border-border bg-card p-4 text-left backdrop-blur transition-all hover:border-[oklch(0.82_0.13_205/35%)] hover:bg-accent"
            onClick={() => setActive(item)}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{item.cluster}</p>
                <p className="mt-2 text-sm leading-6 text-dim">{item.question}</p>
              </div>
              <Badge variant="outline">
                {item.winnerType}
              </Badge>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
              <MiniMetric label={labels.opportunityScore} value={item.opportunityScore} />
              <MiniMetric label={labels.competitorDominance} value={item.competitorDominance.toFixed(2)} />
              <MiniMetric label={labels.answerInclusionRate} value={item.answerInclusionRate.toFixed(2)} />
              <MiniMetric label={labels.noClearWinnerRate} value={item.noClearWinnerRate.toFixed(2)} />
            </div>
          </button>
        ))}
      </div>

      <EvidenceDrawer
        open={Boolean(active)}
        onClose={() => setActive(null)}
        title={active?.cluster ?? ""}
        subtitle={active ? `${active.priority} · ${active.intent}` : undefined}
        summary={active ? `${labels.sampleQuestion}: ${active.question}` : undefined}
        scoreTitle={labels.scoreBreakdown}
        scores={
          active
            ? [
                { label: labels.opportunityScore, value: active.opportunityScore },
                { label: labels.competitorDominance, value: active.competitorDominance.toFixed(2) },
                { label: labels.answerInclusionRate, value: active.answerInclusionRate.toFixed(2) },
                { label: labels.recommendationSlotRate, value: active.recommendationSlotRate.toFixed(2) },
                { label: labels.noClearWinnerRate, value: active.noClearWinnerRate.toFixed(2) },
                { label: labels.winner, value: active.winnerType },
              ]
            : []
        }
        sections={
          active
            ? [
                { label: labels.competitors, items: active.topCompetitors ?? [] },
                { label: labels.reasonOwnership, items: active.reasonOwnership ?? [] },
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
