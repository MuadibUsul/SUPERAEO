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

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-68 border-r border-sidebar-border bg-sidebar px-4 py-5 lg:block">
        <Link href={homeHref} className="group flex items-center gap-3 px-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-transform group-hover:scale-105">
            <Network className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold leading-none">
              {mode === "admin" ? shellCopy.adminTitle : shellCopy.appTitle}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {mode === "admin" ? shellCopy.adminSubtitle : shellCopy.appSubtitle}
            </p>
          </div>
        </Link>
        <nav className="mt-8 space-y-1">
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
                  "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all",
                  "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  isActive && "bg-accent text-accent-foreground",
                )}
              >
                {isActive ? (
                  <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-primary" aria-hidden />
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
      <div className="lg:pl-68">
        <header className="sticky top-0 z-20 border-b border-border bg-background/95 px-4 py-3 backdrop-blur-xl lg:hidden">
          <Link href={homeHref} className="flex items-center gap-2 text-sm font-semibold">
            <Network className="h-4 w-4 text-primary" />
            {mode === "admin" ? dictionary.nav.admin : dictionary.nav.app}
          </Link>
        </header>
        <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-10">
          {children}
        </main>
      </div>
    </div>
  );
}
