"use client";

import { useState } from "react";

import { ArrowRight, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
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
  locale = "zh-CN",
}: {
  opportunities: OpportunityRow[];
  labels: OpportunityBoardLabels;
  locale?: string;
}) {
  const [active, setActive] = useState<OpportunityRow | null>(null);
  const [priority, setPriority] = useState("all");
  const [search, setSearch] = useState("");
  const zh = locale === "zh-CN";
  const filtered = opportunities.filter(item => (priority === "all" || item.priority === priority) && [item.question, item.scenario, ...(item.recommendedContentAssets ?? [])].join(" ").toLowerCase().includes(search.toLowerCase())).sort((a, b) => a.priority.localeCompare(b.priority) || b.longTailOccupationPotential - a.longTailOccupationPotential);


  return (
    <>
      <div className="mb-5 flex flex-col gap-3 border-b border-border pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1" role="group" aria-label={zh ? "按优先级筛选" : "Filter by priority"}>
          {["all", "P0", "P1", "P2", "P3"].map(value => <button key={value} type="button" aria-pressed={priority === value} onClick={() => setPriority(value)} className={`rounded-lg px-3 py-2 text-xs font-medium transition-colors ${priority === value ? "bg-accent text-primary" : "text-muted-foreground hover:bg-muted"}`}>{value === "all" ? (zh ? "全部" : "All") : labels.lanes[value.toLowerCase() as keyof typeof labels.lanes]}<span className="ml-1.5 opacity-60">{value === "all" ? opportunities.length : opportunities.filter(item => item.priority === value).length}</span></button>)}
        </div>
        <div className="relative sm:w-64"><Search className="pointer-events-none absolute left-3 top-3 size-3.5 text-muted-foreground" /><Input aria-label={zh ? "搜索行动" : "Search actions"} placeholder={zh ? "搜索问题或建议内容…" : "Search questions or content…"} value={search} onChange={event => setSearch(event.target.value)} className="h-10 pl-9" /></div>
      </div>
      <p className="mb-4 text-xs leading-5 text-muted-foreground">{zh ? "按机器评估的优先级排序。先查看建议与证据，再决定是否执行；评分不代表收益承诺。" : "Ordered by machine-assessed priority. Review suggestions and evidence before acting; scores do not promise results."}</p>
      <div className="divide-y divide-border">
        {filtered.map((opportunity, index) => <button key={opportunity.id} type="button" aria-haspopup="dialog" className="group grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-lg px-3 py-5 text-left transition-colors hover:bg-muted/60 sm:grid-cols-[32px_minmax(0,1fr)_auto]" onClick={() => setActive(opportunity)}>
          <span className="hidden self-start pt-1 font-mono text-xs text-muted-foreground sm:block">{String(index + 1).padStart(2, "0")}</span>
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2"><Badge variant="secondary" className="text-[10px]">{opportunity.priority}</Badge><span className="text-xs text-muted-foreground">{labels.difficulty}: {opportunity.difficulty}</span></div>
            <h3 className="text-sm font-semibold leading-6">{opportunity.question}</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{opportunity.scenario}</p>
            {opportunity.recommendedContentAssets?.length ? <p className="mt-3 text-xs leading-5"><span className="mr-2 text-primary">{labels.recommendedAssets}</span>{opportunity.recommendedContentAssets.slice(0, 2).join(" / ")}</p> : null}
          </div>
          <span className="flex size-8 items-center justify-center rounded-full border border-border text-muted-foreground group-hover:border-primary/30 group-hover:text-primary"><ArrowRight className="size-3.5" /></span>
        </button>)}
        {filtered.length === 0 ? <p role="status" className="py-12 text-center text-sm text-muted-foreground">{zh ? "没有符合条件的行动，试试其他优先级或关键词。" : "No matching actions. Try another priority or keyword."}</p> : null}
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
