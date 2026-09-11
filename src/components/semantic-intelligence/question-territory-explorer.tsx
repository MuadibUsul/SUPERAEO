"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

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
  validationStatus?: "UNVALIDATED" | "INSUFFICIENT_EVIDENCE" | "VALIDATED";
  supportingSampleCount?: number;
  entityFitScore?: number;
  competitorWeaknessScore?: number;
  answerInclusionPotential?: number;
  contentFeasibilityScore?: number;
  conversionValueScore?: number;
  recommendedContentAssets?: string[];
  missingEvidence?: string[];
  suggestedProbeQueries?: string[];
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
  mapTitle: string;
  mapDescription: string;
  scoreOrder: string;
  noQuestions: string;
  candidateTitle: string;
  candidateDescription: string;
  awaitingValidation: string;
  predictedDifficulty: string;
  supportingSamples: string;
  whyCandidate: string;
  scoreSignals: string;
  recommendedAssets: string;
  missingEvidence: string;
  suggestedQueries: string;
  entityFit: string;
  competitorWeakness: string;
  answerInclusionPotential: string;
  contentFeasibility: string;
  targetOwned: string;
  competitorOwned: string;
  openTerritories: string;
  difficultyLevels: Record<"LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH", string>;
  quadrants: { open: string; easyWins: string; stronghold: string; lowValue: string };
};

const DIFFICULTY_LANES = ["LOW", "MEDIUM", "HIGH", "VERY_HIGH"] as const;
const LANE_TITLES = ["open", "easyWins", "stronghold", "lowValue"] as const;

const ownership = {
  TARGET: { dot: "bg-sky-500", ring: "border-sky-500/25", tint: "bg-sky-500/[0.06]" },
  COMPETITOR: { dot: "bg-amber-500", ring: "border-amber-500/25", tint: "bg-amber-500/[0.06]" },
  OPEN: { dot: "bg-violet-500", ring: "border-violet-500/25", tint: "bg-violet-500/[0.06]" },
} as const;

export function QuestionTerritoryExplorer({
  territory,
  labels,
}: {
  territory: TerritoryItem[];
  labels: TerritoryLabels;
}) {
  const [active, setActive] = useState<TerritoryItem | null>(null);
  const [expandedCandidate, setExpandedCandidate] = useState<string | null>(null);
  const validatedTerritory = territory.filter((item) => item.validationStatus === "VALIDATED");
  const candidates = territory
    .filter((item) => item.validationStatus !== "VALIDATED")
    .sort((a, b) => b.opportunityScore - a.opportunityScore);
  const activeIsValidated = active?.validationStatus === "VALIDATED";

  return (
    <>
      <div data-testid="territory-decision-map" className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex flex-col gap-4 border-b border-border px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-foreground">{labels.mapTitle}</div>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">{labels.mapDescription}</p>
          </div>
          {validatedTerritory.length > 0 ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-muted-foreground" aria-label={labels.winner}>
              <OwnershipLegend dot={ownership.TARGET.dot} label={labels.targetOwned} />
              <OwnershipLegend dot={ownership.COMPETITOR.dot} label={labels.competitorOwned} />
              <OwnershipLegend dot={ownership.OPEN.dot} label={labels.openTerritories} />
            </div>
          ) : (
            <Badge variant="outline" className="border-amber-500/30 bg-amber-500/[0.08] text-amber-700">{candidates.length} {labels.awaitingValidation}</Badge>
          )}
        </div>

        {validatedTerritory.length > 0 ? <div className="overflow-x-auto">
          <div className="grid min-w-[880px] grid-cols-4 divide-x divide-border">
            {DIFFICULTY_LANES.map((difficulty, laneIndex) => {
              const items = validatedTerritory
                .filter((item) => item.difficulty === difficulty)
                .sort((a, b) => b.opportunityScore - a.opportunityScore);

              return (
                <section key={difficulty} className="min-w-0 bg-muted/20">
                  <div className="border-b border-border bg-card px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                        {labels.difficultyLevels[difficulty]}
                      </span>
                      <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground">{items.length}</span>
                    </div>
                    <div className="mt-1 text-sm font-semibold text-foreground">{labels.quadrants[LANE_TITLES[laneIndex]]}</div>
                  </div>

                  <div className="max-h-[30rem] min-h-40 space-y-2 overflow-y-auto p-3">
                    {items.length > 0 ? items.map((item) => {
                      const ownerKey = item.winnerType === "TARGET" ? "TARGET" : item.winnerType === "COMPETITOR" ? "COMPETITOR" : "OPEN";
                      const owner = ownership[ownerKey];
                      const ownerLabel = ownerKey === "TARGET" ? labels.targetOwned : ownerKey === "COMPETITOR" ? labels.competitorOwned : labels.openTerritories;

                      return (
                        <button
                          key={`${item.cluster}-${item.question}`}
                          type="button"
                          className={`group w-full min-w-0 rounded-xl border ${owner.ring} ${owner.tint} p-3 text-left transition-[transform,background-color,border-color,box-shadow] duration-150 ease-out hover:border-primary/30 hover:bg-card hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 active:scale-[0.985]`}
                          onClick={() => setActive(item)}
                        >
                          <div className="flex items-start gap-3">
                            <div className="grid size-10 shrink-0 place-items-center rounded-lg border border-border bg-card font-mono text-sm font-semibold text-foreground shadow-sm">
                              {item.opportunityScore}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <p className="truncate text-xs font-semibold text-foreground">{item.cluster}</p>
                                <Badge variant="outline" className="shrink-0 px-1.5 py-0 font-mono text-[9px]">{item.priority}</Badge>
                              </div>
                              <p className="mt-1 line-clamp-2 text-[11px] leading-[1.55] text-muted-foreground">{item.question}</p>
                              <div className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                                <span className={`size-1.5 rounded-full ${owner.dot}`} aria-hidden="true" />
                                <span>{ownerLabel}</span>
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    }) : (
                      <div className="grid min-h-28 place-items-center rounded-xl border border-dashed border-border px-4 text-center text-xs text-muted-foreground">
                        {labels.noQuestions}
                      </div>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </div> : null}

        {candidates.length > 0 ? (
          <section className={validatedTerritory.length > 0 ? "border-t border-border" : undefined}>
            <div className="border-b border-amber-500/20 bg-amber-500/[0.06] px-5 py-3">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{labels.candidateTitle}</h3>
                  <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{labels.candidateDescription}</p>
                </div>
                <span className="mt-2 shrink-0 font-mono text-[10px] text-amber-700 sm:mt-0">{candidates.length} {labels.awaitingValidation}</span>
              </div>
            </div>
            <div className="grid max-h-[32rem] gap-2 overflow-y-auto bg-muted/20 p-3 md:grid-cols-2">
              {candidates.map((item, index) => {
                const candidateKey = `${item.cluster}-${item.question}`;
                const expanded = expandedCandidate === candidateKey;
                const detailsId = `candidate-details-${index}`;

                return (
                  <article key={candidateKey} className={`min-w-0 overflow-hidden rounded-xl border bg-card transition-[border-color,box-shadow] duration-150 ${expanded ? "border-primary/30 shadow-sm md:col-span-2" : "border-border"}`}>
                    <button
                      type="button"
                      className="group flex w-full min-w-0 items-start gap-3 p-3 text-left transition-[transform,background-color] duration-150 ease-out hover:bg-muted/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50 active:scale-[0.995]"
                      aria-expanded={expanded}
                      aria-controls={detailsId}
                      onClick={() => setExpandedCandidate(expanded ? null : candidateKey)}
                    >
                      <span className="w-7 shrink-0 pt-0.5 text-center font-mono text-[10px] text-muted-foreground">#{String(index + 1).padStart(2, "0")}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start justify-between gap-3">
                          <span className="min-w-0">
                            <span className="block truncate text-xs font-semibold text-foreground">{item.cluster}</span>
                            <span className="mt-1 block line-clamp-2 text-[11px] leading-[1.55] text-muted-foreground">{item.question}</span>
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            <span className="grid size-10 place-items-center rounded-lg border border-border bg-muted/40 font-mono text-sm font-semibold text-foreground">{item.opportunityScore}</span>
                            <ChevronDown className={`size-4 text-muted-foreground transition-transform duration-150 ease-out ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
                          </span>
                        </span>
                        <span className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                          <Badge variant="outline" className="px-1.5 py-0 font-mono text-[9px]">{item.priority}</Badge>
                          <span>{labels.predictedDifficulty}: {labels.difficultyLevels[item.difficulty as keyof typeof labels.difficultyLevels] ?? item.difficulty}</span>
                          <span className="text-amber-700">{labels.awaitingValidation}</span>
                        </span>
                      </span>
                    </button>

                    {expanded ? (
                      <div id={detailsId} className="border-t border-border bg-muted/15 px-4 py-4">
                        <div className="grid gap-4 lg:grid-cols-[1.2fr_2fr]">
                          <section>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{labels.whyCandidate}</p>
                            <p className="mt-2 text-sm leading-6 text-foreground">{item.scenario}</p>
                          </section>
                          <section>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{labels.scoreSignals}</p>
                            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                              <Signal label={labels.entityFit} value={item.entityFitScore} />
                              <Signal label={labels.competitorWeakness} value={item.competitorWeaknessScore} />
                              <Signal label={labels.answerInclusionPotential} value={item.answerInclusionPotential} />
                              <Signal label={labels.contentFeasibility} value={item.contentFeasibilityScore} />
                            </div>
                          </section>
                        </div>
                        <div className="mt-4 grid gap-3 lg:grid-cols-3">
                          <DetailList title={labels.recommendedAssets} items={item.recommendedContentAssets} fallback={labels.noEvidence} />
                          <DetailList title={labels.missingEvidence} items={item.missingEvidence} fallback={labels.noEvidence} />
                          <DetailList title={labels.suggestedQueries} items={item.suggestedProbeQueries} fallback={labels.noEvidence} />
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}

        <div className="flex items-center justify-between border-t border-border bg-muted/30 px-5 py-2.5 text-[10px] text-muted-foreground">
          <span>{labels.scoreOrder}</span>
          <span>{labels.opportunityScore} · 0—100</span>
        </div>
      </div>

      <EvidenceDrawer
        open={Boolean(active)}
        onClose={() => setActive(null)}
        title={active?.cluster ?? ""}
        subtitle={active ? `${activeIsValidated ? labels.winner : labels.awaitingValidation} · ${active.priority} · ${active.intent}` : undefined}
        summary={active ? `${labels.sampleQuestion}: ${active.question}` : undefined}
        scoreTitle={labels.scoreBreakdown}
        scores={
          activeIsValidated && active
            ? [
                { label: labels.opportunityScore, value: active.opportunityScore },
                { label: labels.competitorDominance, value: active.competitorDominance.toFixed(2) },
                { label: labels.answerInclusionRate, value: active.answerInclusionRate.toFixed(2) },
                { label: labels.recommendationSlotRate, value: active.recommendationSlotRate.toFixed(2) },
                { label: labels.noClearWinnerRate, value: active.noClearWinnerRate.toFixed(2) },
                { label: labels.winner, value: active.winnerType },
              ]
            : active
              ? [
                  { label: labels.opportunityScore, value: active.opportunityScore },
                  { label: labels.predictedDifficulty, value: labels.difficultyLevels[active.difficulty as keyof typeof labels.difficultyLevels] ?? active.difficulty },
                  { label: labels.supportingSamples, value: active.supportingSampleCount ?? 0 },
                ]
              : []
        }
        sections={
          activeIsValidated && active
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

function OwnershipLegend({ dot, label }: { dot: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`size-2 rounded-full ${dot}`} aria-hidden="true" />
      {label}
    </span>
  );
}

function Signal({ label, value }: { label: string; value?: number }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <div className="truncate text-[9px] text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-sm font-semibold text-foreground">{value ?? "—"}</div>
    </div>
  );
}

function DetailList({ title, items, fallback }: { title: string; items?: string[]; fallback: string }) {
  return (
    <section className="rounded-lg border border-border bg-card p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{title}</p>
      {items?.length ? (
        <ul className="mt-2 space-y-1.5 text-xs leading-5 text-foreground">
          {items.slice(0, 4).map((item, index) => <li key={`${item}-${index}`} className="before:mr-2 before:text-primary before:content-['·']">{item}</li>)}
        </ul>
      ) : <p className="mt-2 text-xs leading-5 text-muted-foreground">{fallback}</p>}
    </section>
  );
}
