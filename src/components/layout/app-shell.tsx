"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, ArrowLeft, ArrowUpRight, BookOpen, ChevronDown, FolderOpen, GitCompare, KeyRound, LayoutDashboard, ListChecks, Menu, Network, Plus, Search, Settings2, ShieldCheck, Waypoints } from "lucide-react";
import { CipMark } from "@/components/brand/cip-mark";
import { LogoutButton } from "@/components/auth/logout-button";
import { ProjectWorkflowNav } from "@/components/layout/project-workflow-nav";
import type { Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { cn } from "@/lib/utils";
import type { AuthSession } from "@/server/auth/session";

const adminNav = [
  { key: "overview", href: "/admin", icon: LayoutDashboard },
  { key: "users", href: "/admin/users", icon: Network },
  { key: "organizations", href: "/admin/organizations", icon: GitCompare },
  { key: "projects", href: "/admin/projects", icon: FolderOpen },
  { key: "providers", href: "/admin/ai-providers", icon: KeyRound },
  { key: "models", href: "/admin/models", icon: Settings2 },
  { key: "prompts", href: "/admin/prompts", icon: Search },
  { key: "queues", href: "/admin/queues", icon: ListChecks },
  { key: "routing", href: "/admin/routing", icon: Waypoints },
  { key: "traceLogs", href: "/admin/logs", icon: Activity },
  { key: "usage", href: "/admin/usage", icon: LayoutDashboard },
  { key: "auditLogs", href: "/admin/audit-logs", icon: ShieldCheck },
  { key: "system", href: "/admin/system", icon: Settings2 },
];


export function AppShell({ children, locale = "zh-CN", session, mode = "app" }: {
  children: React.ReactNode; locale?: Locale; session?: AuthSession; mode?: "app" | "admin";
}) {
  const pathname = usePathname();
  const dictionary = getDictionary(locale);
  const zh = locale === "zh-CN";
  const home = `/${locale}${mode === "admin" ? "/admin" : "/app/projects"}`;
  const projectSegment = pathname.split("/app/projects/")[1]?.split("/")[0];
  const projectId = projectSegment && projectSegment !== "new" ? projectSegment : undefined;
  const navigation = mode === "admin" ? <nav aria-label={zh ? "管理导航" : "Administration"} className="space-y-1">
    {adminNav.map(item => {
      const href = `/${locale}${item.href}`;
      const active = pathname === href || (item.href !== "/admin" && pathname.startsWith(href));
      return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={cn("workspace-nav-link", active && "is-active")}><item.icon className="size-4 shrink-0" />{dictionary.admin[item.key as keyof typeof dictionary.admin] ?? item.key}</Link>;
    })}
  </nav> : projectId ? <ProjectWorkflowNav projectId={projectId} locale={locale} /> : <nav aria-label={zh ? "工作台导航" : "Workspace navigation"} className="space-y-1">
    <Link href={home} className={cn("workspace-nav-link", pathname === home && "is-active")} aria-current={pathname === home ? "page" : undefined}><FolderOpen className="size-4" />{zh ? "我的项目" : "My projects"}</Link>
    <Link href={`/${locale}/app/projects/new`} className={cn("workspace-nav-link", projectSegment === "new" && "is-active")}><Plus className="size-4" />{dictionary.app.newProject}</Link>
    <Link href={`/${locale}/methodology`} className="workspace-nav-link"><BookOpen className="size-4" />{zh ? "方法与帮助" : "Methodology & help"}</Link>
  </nav>;

  return <div className="workspace-shell min-h-screen">
    <a href="#workspace-content" className="skip-link">{zh ? "跳至主要内容" : "Skip to content"}</a>
    <aside className="workspace-sidebar fixed inset-y-0 left-0 z-30 hidden w-[232px] flex-col border-r border-border lg:flex">
      <Link href={home} className="flex h-[76px] shrink-0 items-center gap-3 px-6"><span className="flex size-8 items-center justify-center rounded-lg bg-foreground text-background"><CipMark size={22} /></span><span className="text-lg font-semibold tracking-tight">CIP<span className="ml-2 text-[11px] font-normal text-muted-foreground">{mode === "admin" ? "Console" : "Workspace"}</span></span></Link>
      {projectId ? <Link href={home} className="mx-3 mb-5 flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5 text-xs text-muted-foreground"><ArrowLeft className="size-3.5" />{zh ? "全部项目" : "All projects"}<ChevronDown className="ml-auto size-3" /></Link> : null}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-6">{navigation}</div>
      <div className="mx-4 shrink-0 border-t border-border py-4">
        <div className="mb-3 flex items-center gap-2.5"><span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-primary">{session?.user.email?.slice(0, 1).toUpperCase() ?? "C"}</span><span className="min-w-0"><span className="block text-xs font-medium">{zh ? "我的账户" : "My account"}</span><span className="block truncate text-[11px] text-muted-foreground">{session?.user.email}</span></span></div>
        <LogoutButton locale={locale} label={dictionary.nav.logout} />
      </div>
    </aside>
    <div className="min-w-0 lg:pl-[232px]">
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-border bg-card/95 px-4 backdrop-blur-md sm:px-7 lg:px-9">
        <div className="flex min-w-0 items-center gap-3">
          <details key={pathname} className="group lg:hidden">
            <summary aria-label={zh ? "打开导航菜单" : "Open navigation menu"} className="flex size-9 cursor-pointer list-none items-center justify-center rounded-lg border border-border"><Menu className="size-4" /></summary>
            <div className="absolute inset-x-0 top-14 max-h-[calc(100dvh-56px)] overflow-y-auto border-b border-border bg-card p-5 shadow-lg">
              <Link href={home} className="workspace-nav-link mb-4"><ArrowLeft className="size-4" />{zh ? "全部项目" : "All projects"}</Link>
              {navigation}
              <div className="mt-5 border-t border-border pt-4"><LogoutButton locale={locale} label={dictionary.nav.logout} /></div>
            </div>
          </details>
          <Link href={home} className="truncate text-xs text-muted-foreground">{mode === "admin" ? (zh ? "运营控制台" : "Administration") : (zh ? "我的项目" : "My projects")}</Link>
          {projectId ? <><span className="text-border-strong">/</span><span className="text-xs font-medium">{zh ? "项目工作空间" : "Project workspace"}</span></> : null}
        </div>
        <Link href={`/${locale}/methodology`} className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">{zh ? "方法与边界" : "Methodology"}<ArrowUpRight className="size-3" /></Link>
      </header>
      <main id="workspace-content" tabIndex={-1} className="mx-auto flex w-full max-w-[1440px] min-w-0 flex-col gap-7 px-4 py-7 outline-none sm:px-7 lg:px-9 lg:py-9">{children}</main>
    </div>
  </div>;
}
