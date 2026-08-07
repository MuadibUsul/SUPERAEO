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
          "group inline-flex h-9 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
          isActive && "bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary",
        )}
      >
        {stageIndex >= 0 ? (
          <span
            className={cn(
              "font-mono text-[11px] tabular-nums",
              isActive ? "text-primary" : "text-faint group-hover:text-muted-foreground",
            )}
          >
            {stageIndex + 1}
          </span>
        ) : (
          <Icon className={cn("h-4 w-4", isActive && "text-primary")} />
        )}
        {dictionary.app.hubs[hub.key]}
      </Link>
    );
  };

  return (
    <div className="space-y-3">
      <AuditStatusPanel projectId={projectId} locale={currentLocale} copy={dictionary.auditStatus} variant={statusVariant} />
      <nav className="panel flex items-center gap-1 overflow-x-auto p-1.5">
        {stageHubs.map((hub, index) => (
          <div key={hub.key} className="flex shrink-0 items-center">
            {renderHub(hub)}
            {index < stageHubs.length - 1 ? (
              <span className="mx-0.5 text-border-strong" aria-hidden>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </span>
            ) : null}
          </div>
        ))}
        <span className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden />
        {renderHub(settingsHub)}
      </nav>
      {activeHub.segments.length > 1 ? (
        <div className="flex gap-1 overflow-x-auto px-1">
          {activeHub.segments.map((segment) => {
            const href = `/${currentLocale}/app/projects/${projectId}/${segment}`;
            const isActive = segment === activeSegment;
            const labelKey = segmentLabelKey[segment];
            return (
              <Link
                key={segment}
                href={href}
                className={cn(
                  "inline-flex h-7 shrink-0 items-center rounded-md px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground",
                  isActive && "bg-primary/10 text-primary",
                )}
              >
                {dictionary.app[labelKey]}
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
