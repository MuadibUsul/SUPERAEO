"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FolderOpen,
  GitCompare,
  Activity,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  Network,
  ShieldCheck,
  Search,
  Settings2,
  Waypoints,
} from "lucide-react";

import { CipMark } from "@/components/brand/cip-mark";
import { LogoutButton } from "@/components/auth/logout-button";
import type { Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { cn } from "@/lib/utils";
import type { AuthSession } from "@/server/auth/session";

const userNav = [
  { key: "projects", href: "/app/projects", icon: FolderOpen },
];

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

export function AppShell({
  children,
  locale = "zh-CN",
  session,
  mode = "app",
}: {
  children: React.ReactNode;
  locale?: Locale;
  session?: AuthSession;
  mode?: "app" | "admin";
}) {
  const pathname = usePathname();
  const dictionary = getDictionary(locale);
  const navItems = mode === "admin" ? adminNav : userNav;
  const labels = mode === "admin" ? dictionary.admin : dictionary.app;
  const homeHref = `/${locale}${mode === "admin" ? "/admin" : "/app/projects"}`;
  const shellCopy =
    locale === "zh-CN"
      ? {
          appTitle: "CIP 认知工作台",
          appSubtitle: "Cognition Intelligence Platform",
          adminTitle: "CIP 运营控制台",
          adminSubtitle: "Platform operations",
        }
      : {
          appTitle: "CIP Command Center",
          appSubtitle: "Cognition Intelligence Platform",
          adminTitle: "CIP Operator Console",
          adminSubtitle: "Platform operations",
        };

  if (mode === "app") {
    return (
      <div className="workspace-shell app-canvas min-h-screen">
        <header className="sticky top-0 z-40 border-b border-border bg-card/92 backdrop-blur-xl">
          <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-5">
              <Link href={homeHref} className="group flex shrink-0 items-center gap-2.5">
                <span className="flex size-9 items-center justify-center rounded-lg border border-border bg-background shadow-sm">
                  <CipMark size={23} className="text-foreground transition-transform duration-150 ease-out group-active:scale-[0.97]" />
                </span>
                <span className="hidden sm:block">
                  <span className="block text-sm font-semibold leading-none">CIP</span>
                  <span className="mt-1 block text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Cognition workspace</span>
                </span>
              </Link>
              <span className="hidden h-5 w-px bg-border sm:block" />
              <Link
                href={homeHref}
                className={cn(
                  "inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.98]",
                  pathname.startsWith(`/${locale}/app/projects`) ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <FolderOpen className="size-4" />
                {dictionary.app.projects}
              </Link>
            </div>
            <div className="flex min-w-0 items-center gap-3">
              <span className="hidden max-w-52 truncate text-xs text-muted-foreground md:block">{session?.user.email}</span>
              <LogoutButton locale={locale} label={dictionary.nav.logout} />
            </div>
          </div>
        </header>
        <main className="mx-auto flex w-full max-w-[1440px] flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className="workspace-shell app-canvas relative min-h-screen text-foreground">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-sidebar-border bg-sidebar/96 px-3 py-5 backdrop-blur-xl lg:block">
        <Link href={homeHref} className="group flex items-center gap-3 px-2.5">
          <CipMark size={28} className="text-foreground transition-transform duration-150 ease-out group-active:scale-[0.97]" />
          <div>
            <p className="text-sm font-semibold leading-none">
              {mode === "admin" ? shellCopy.adminTitle : shellCopy.appTitle}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {mode === "admin" ? shellCopy.adminSubtitle : shellCopy.appSubtitle}
            </p>
          </div>
        </Link>
        <div className="mx-2.5 mt-7 h-px bg-sidebar-border" />
        <p className="eyebrow mx-2.5 mt-5 mb-2 text-[10px]">{mode === "admin" ? "Operations" : "Workspace"}</p>
        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const href = `/${locale}${item.href}`;
            const label = labels[item.key as keyof typeof labels] ?? item.key;
            const isActive = pathname === href || (item.href !== "/admin" && pathname.startsWith(href));

            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "group relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.98]",
                  "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  isActive && "bg-accent text-accent-foreground",
                )}
              >
                {isActive ? (
                  <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary shadow-[0_0_12px_var(--primary)]" aria-hidden />
                ) : null}
                <Icon className={cn("h-4 w-4 transition-colors", isActive && "text-primary")} />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="absolute inset-x-4 bottom-5 space-y-3 border-t border-sidebar-border pt-4 text-xs text-muted-foreground">
          <p className="truncate">{session?.user.email}</p>
          <LogoutButton locale={locale} label={dictionary.nav.logout} />
        </div>
      </aside>
      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-background/88 px-4 py-3 backdrop-blur-xl lg:hidden">
          <Link href={homeHref} className="flex items-center gap-2 text-sm font-semibold">
            <CipMark size={20} className="text-foreground" />
            {mode === "admin" ? dictionary.nav.admin : dictionary.nav.app}
          </Link>
          <span className="eyebrow text-[10px]">{mode === "admin" ? "Operator" : "Observatory"}</span>
        </header>
        <main className="mx-auto flex w-full max-w-[1500px] flex-col gap-7 px-4 py-6 sm:px-6 lg:px-8 xl:px-10">
          {children}
        </main>
      </div>
    </div>
  );
}
