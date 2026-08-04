"use client";

import type { ComponentType } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, FlaskConical, LayoutDashboard, Settings2, Sparkles } from "lucide-react";

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

type HubKey = "overview" | "config" | "insights" | "verification" | "reports";

type Hub = {
  key: HubKey;
  icon: ComponentType<{ className?: string }>;
  segments: string[]; // segments[0] is the hub landing page
};

const hubs: Hub[] = [
  { key: "overview", icon: LayoutDashboard, segments: ["dashboard", "alerts"] },
  { key: "config", icon: Settings2, segments: ["keywords", "queries", "competitors", "entity", "settings"] },
  { key: "insights", icon: Sparkles, segments: ["semantic-nebula", "semantic-coverage", "question-territory", "opportunities"] },
  { key: "verification", icon: FlaskConical, segments: ["proof", "runs", "evidence"] },
  { key: "reports", icon: FileText, segments: ["reports"] },
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
  const activeHub = hubs.find((hub) => hub.segments.includes(activeSegment)) ?? hubs[0];

  return (
    <div className="space-y-3">
      <AuditStatusPanel projectId={projectId} locale={currentLocale} copy={dictionary.auditStatus} variant={statusVariant} />
      <nav className="panel flex gap-1 overflow-x-auto p-1.5">
        {hubs.map((hub) => {
          const href = `/${currentLocale}/app/projects/${projectId}/${hub.segments[0]}`;
          const Icon = hub.icon;
          const isActive = hub.key === activeHub.key;
          return (
            <Link
              key={hub.key}
              href={href}
              className={cn(
                "inline-flex h-9 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                isActive && "bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary",
              )}
            >
              <Icon className={cn("h-4 w-4", isActive && "text-primary")} />
              {dictionary.app.hubs[hub.key]}
            </Link>
          );
        })}
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
