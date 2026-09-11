"use client";

import type { ComponentType } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Brain, FlaskConical, Radar, Settings2, Target } from "lucide-react";

import { AuditStatusPanel } from "@/components/diagnosis/audit-status-panel";
import { getDictionary } from "@/i18n/dictionaries";
import { cn } from "@/lib/utils";

type LocaleKey = "zh-CN" | "en";

type SegmentLabelKey =
  | "dashboard"
  | "alerts"
  | "keywords"
  | "queries"
  | "competitors"
  | "entity"
  | "settings"
  | "semanticNebula"
  | "coverage"
  | "questionTerritory"
  | "opportunities"
  | "proof"
  | "runs"
  | "evidence"
  | "reports";

type HubKey = "diagnose" | "cognition" | "act" | "prove" | "settings";

type Hub = {
  key: HubKey;
  icon: ComponentType<{ className?: string }>;
  segments: string[]; // segments[0] is the hub landing page
};

// The four-stage product spine: Diagnose → Cognition → Act → Prove.
// Setup lives in a demoted Settings hub, not on the main journey.
const hubs: Hub[] = [
  { key: "diagnose", icon: Radar, segments: ["runs", "evidence"] },
  { key: "cognition", icon: Brain, segments: ["dashboard", "semantic-nebula", "semantic-coverage", "alerts"] },
  { key: "act", icon: Target, segments: ["opportunities", "question-territory"] },
  { key: "prove", icon: FlaskConical, segments: ["proof", "reports"] },
  { key: "settings", icon: Settings2, segments: ["settings", "keywords", "queries", "competitors", "entity"] },
];

const segmentLabelKey: Record<string, SegmentLabelKey> = {
  dashboard: "dashboard",
  alerts: "alerts",
  keywords: "keywords",
  queries: "queries",
  competitors: "competitors",
  entity: "entity",
  settings: "settings",
  "semantic-nebula": "semanticNebula",
  "semantic-coverage": "coverage",
  "question-territory": "questionTerritory",
  opportunities: "opportunities",
  proof: "proof",
  runs: "runs",
  evidence: "evidence",
  reports: "reports",
};

const stageHubs = hubs.filter((hub) => hub.key !== "settings");
const settingsHub = hubs.find((hub) => hub.key === "settings")!;

export function ProjectWorkflowNav({
  projectId,
  locale = "zh-CN",
  statusVariant = "compact",
}: {
  projectId: string;
  locale?: string;
  workflowState?: unknown;
  statusVariant?: "expanded" | "compact";
}) {
  const pathname = usePathname();
  const currentLocale: LocaleKey = locale === "en" ? "en" : "zh-CN";
  const dictionary = getDictionary(currentLocale);

  const activeSegment = pathname.split(`/projects/${projectId}/`)[1]?.split("/")[0] ?? "dashboard";
  const activeHub = hubs.find((hub) => hub.segments.includes(activeSegment)) ?? hubs[1];

  const renderHub = (hub: Hub) => {
    const href = `/${currentLocale}/app/projects/${projectId}/${hub.segments[0]}`;
    const Icon = hub.icon;
    const isActive = hub.key === activeHub.key;
    const stageIndex = stageHubs.findIndex((item) => item.key === hub.key);
    return (
      <Link
        key={hub.key}
        href={href}
        className={cn(
          "group flex h-12 min-w-[72px] flex-1 shrink-0 items-center gap-2 rounded-lg px-2 text-sm font-medium text-muted-foreground transition-[background-color,color,transform,box-shadow] duration-150 ease-out hover:bg-accent hover:text-foreground active:scale-[0.985] md:min-w-32 md:gap-3 md:px-3",
          isActive && "bg-primary text-primary-foreground shadow-sm hover:bg-primary hover:text-primary-foreground",
        )}
      >
        <Icon className={cn("size-4 shrink-0", isActive ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground")} />
        <span className="flex min-w-0 flex-col">
          <span className={cn("text-[9px] font-semibold uppercase tracking-[0.12em]", isActive ? "text-primary-foreground/70" : "text-faint")}>
            {stageIndex >= 0 ? String(stageIndex + 1).padStart(2, "0") : "—"}
          </span>
          <span className="truncate leading-4">{dictionary.app.hubs[hub.key]}</span>
        </span>
      </Link>
    );
  };

  return (
    <div className="space-y-3">
      <nav className="flex gap-1.5 overflow-x-auto rounded-xl border border-border bg-card p-1.5 shadow-sm">
        {stageHubs.map(renderHub)}
        <span className="my-2 w-px shrink-0 bg-border" aria-hidden />
        {renderHub(settingsHub)}
      </nav>
      {activeHub.segments.length > 1 ? (
        <div className="flex items-center gap-1 overflow-x-auto px-1">
          <span className="mr-2 shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-faint">
            {currentLocale === "zh-CN" ? "当前阶段" : "Current stage"}
          </span>
          {activeHub.segments.map((segment) => {
            const href = `/${currentLocale}/app/projects/${projectId}/${segment}`;
            const isActive = segment === activeSegment;
            const labelKey = segmentLabelKey[segment];
            return (
              <Link
                key={segment}
                href={href}
                className={cn(
                  "inline-flex h-8 shrink-0 items-center rounded-md px-2.5 text-xs font-medium text-muted-foreground transition-[background-color,color,transform] duration-150 hover:bg-card hover:text-foreground active:scale-[0.98]",
                  isActive && "bg-card text-primary shadow-sm ring-1 ring-border",
                )}
              >
                {dictionary.app[labelKey]}
              </Link>
            );
          })}
        </div>
      ) : null}
      <AuditStatusPanel projectId={projectId} locale={currentLocale} copy={dictionary.auditStatus} variant={statusVariant} />
    </div>
  );
}
