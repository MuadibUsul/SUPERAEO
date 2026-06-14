"use client";

import type { ComponentType } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, LayoutDashboard, Settings2, Sparkles, Target, Archive } from "lucide-react";

import { AuditStatusPanel } from "@/components/diagnosis/audit-status-panel";
import { getDictionary } from "@/i18n/dictionaries";
import { cn } from "@/lib/utils";

type LocaleKey = "zh-CN" | "en";

type MainNavItem = {
  segment: string;
  labelKey: "dashboard" | "semanticNebula" | "opportunities" | "reports" | "evidence" | "settings";
  icon: ComponentType<{ className?: string }>;
};

const mainNav: MainNavItem[] = [
  { segment: "dashboard", labelKey: "dashboard", icon: LayoutDashboard },
  { segment: "semantic-nebula", labelKey: "semanticNebula", icon: Sparkles },
  { segment: "opportunities", labelKey: "opportunities", icon: Target },
  { segment: "reports", labelKey: "reports", icon: FileText },
  { segment: "evidence", labelKey: "evidence", icon: Archive },
  { segment: "settings", labelKey: "settings", icon: Settings2 },
];

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

  return (
    <div className="space-y-3">
      <AuditStatusPanel projectId={projectId} locale={currentLocale} copy={dictionary.auditStatus} variant={statusVariant} />
      <nav className="panel flex gap-1 overflow-x-auto p-1.5">
        {mainNav.map((item) => {
          const href = `/${currentLocale}/app/projects/${projectId}/${item.segment}`;
          const Icon = item.icon;
          const isActive = pathname === href;
          return (
            <Link
              key={item.segment}
              href={href}
              className={cn(
                "inline-flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-all hover:bg-accent hover:text-accent-foreground",
                isActive && "bg-accent text-foreground",
              )}
            >
              <Icon className={cn("h-4 w-4", isActive && "text-primary")} />
              {dictionary.app[item.labelKey]}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
