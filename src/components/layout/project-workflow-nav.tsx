"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, ArrowUpRight, BookOpen, ChartNoAxesCombined, ChevronDown, FileText, FlaskConical, LayoutDashboard, Orbit, Settings2, Target } from "lucide-react";
import { getDictionary } from "@/i18n/dictionaries";
import { cn } from "@/lib/utils";

export function ProjectWorkflowNav({ projectId, locale = "zh-CN" }: { projectId: string; locale?: string }) {
  const pathname = usePathname();
  const safeLocale = locale === "en" ? "en" : "zh-CN";
  const zh = safeLocale === "zh-CN";
  const labels = getDictionary(safeLocale).app;
  const base = `/${safeLocale}/app/projects/${projectId}`;
  const segment = pathname.slice(base.length).split("/")[1] || "dashboard";
  const groups = [
    { title: zh ? "工作空间" : "WORKSPACE", items: [
      { segment: "dashboard", label: zh ? "项目总览" : "Overview", icon: LayoutDashboard },
      { segment: "semantic-nebula", label: labels.semanticNebula, icon: Orbit },
      { segment: "opportunities", label: zh ? "优先行动" : "Priority actions", icon: Target },
    ] },
    { title: zh ? "分析与验证" : "ANALYZE & VALIDATE", items: [
      { segment: "runs", label: zh ? "采样与复测" : "Sampling & retests", icon: Activity },
      { segment: "evidence", label: labels.evidence, icon: BookOpen },
      { segment: "proof", label: zh ? "效果评估" : "Effect assessment", icon: FlaskConical },
      { segment: "reports", label: labels.reports, icon: FileText },
    ] },
  ];
  const secondary = [
    ["semantic-coverage", labels.coverage], ["question-territory", labels.questionTerritory], ["alerts", labels.alerts],
  ];
  const settings = [["settings", labels.settings], ["entity", labels.entity], ["competitors", labels.competitors], ["keywords", labels.keywords], ["queries", labels.queries]];
  const link = (value: string, label: string) => <Link key={value} href={`${base}/${value}`} aria-current={segment === value ? "page" : undefined} className={cn("workspace-nav-link pl-10", segment === value && "is-active")}>{label}</Link>;

  return <nav aria-label={zh ? "项目导航" : "Project navigation"} className="space-y-6">
    {groups.map(group => <div key={group.title}>
      <p className="mb-2 px-3 text-[10px] font-semibold tracking-[0.1em] text-muted-foreground">{group.title}</p>
      <div className="space-y-1">{group.items.map(item => <Link key={item.segment} href={`${base}/${item.segment}`} aria-current={segment === item.segment ? "page" : undefined} className={cn("workspace-nav-link", segment === item.segment && "is-active")}><item.icon className="size-4 shrink-0" /><span>{item.label}</span>{item.segment === "semantic-nebula" ? <span className="ml-auto size-1.5 rounded-full bg-violet" aria-hidden /> : null}</Link>)}</div>
    </div>)}
    <div className="space-y-2 border-t border-border pt-4">
      <details key={`analysis-${secondary.some(([s]) => s === segment)}`} open={secondary.some(([s]) => s === segment)} className="group/nav">
        <summary className="workspace-nav-link cursor-pointer list-none"><ChartNoAxesCombined className="size-4" />{zh ? "深入分析" : "Explore analysis"}<ChevronDown className="ml-auto size-3.5 group-open/nav:rotate-180" /></summary>
        {secondary.map(([value, label]) => link(value, label))}
      </details>
      <details key={`settings-${settings.some(([s]) => s === segment)}`} open={settings.some(([s]) => s === segment)} className="group/nav">
        <summary className="workspace-nav-link cursor-pointer list-none"><Settings2 className="size-4" />{zh ? "项目设置" : "Project settings"}<ChevronDown className="ml-auto size-3.5 group-open/nav:rotate-180" /></summary>
        {settings.map(([value, label]) => link(value, label))}
      </details>
      <Link href={`/${safeLocale}/methodology`} className="workspace-nav-link text-xs"><BookOpen className="size-4" />{zh ? "方法与帮助" : "Methodology & help"}<ArrowUpRight className="ml-auto size-3" /></Link>
    </div>
  </nav>;
}
