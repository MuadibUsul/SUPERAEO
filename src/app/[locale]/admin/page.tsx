import Link from "next/link";
import { ArrowRight, Database, KeyRound, Network, Radar, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { normalizeLocale } from "@/i18n/config";
import { getPrisma } from "@/server/db";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ locale: string }>;
};

export default async function AdminOverviewPage({ params }: PageProps) {
  const { locale: rawLocale } = await params;
  const locale = normalizeLocale(rawLocale);
  const prisma = getPrisma();
  const [users, organizations, projects, providers, runs, usage, failures] = await Promise.all([
    prisma.user.count(),
    prisma.organization.count(),
    prisma.project.count(),
    prisma.aIProvider.count(),
    prisma.samplingRun.count(),
    prisma.aIUsageLog.count(),
    prisma.aIUsageLog.count({ where: { status: "failed" } }),
  ]);

  const copy =
    locale === "zh-CN"
      ? {
          badge: "Operator Console",
          title: "平台运营概览",
          body:
            "统一查看组织、项目、AI Provider、用量、失败率和系统健康，确保 CIP 的认知采样与分析链路持续可用。",
          cta: "配置 AI Providers",
          stats: [
            ["用户", users, Users],
            ["组织", organizations, Network],
            ["项目", projects, Database],
            ["AI Providers", providers, KeyRound],
          ] as const,
          status: [
            ["采样运行", runs],
            ["AI 调用", usage],
            ["失败调用", failures],
          ] as const,
        }
      : {
          badge: "Operator Console",
          title: "Platform overview",
          body:
            "Monitor organizations, projects, AI providers, usage, failure rate, and system health from one place so the CIP sampling and analysis pipeline stays reliable.",
          cta: "Configure AI Providers",
          stats: [
            ["Users", users, Users],
            ["Organizations", organizations, Network],
            ["Projects", projects, Database],
            ["AI Providers", providers, KeyRound],
          ] as const,
          status: [
            ["Sampling runs", runs],
            ["AI calls", usage],
            ["Failed calls", failures],
          ] as const,
        };

  return (
    <div className="space-y-6">
      <section className="panel-strong p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-3xl">
            <Badge
              variant="outline"
              className="gap-1.5 border-[oklch(0.82_0.13_205/25%)] bg-[oklch(0.82_0.13_205/10%)] text-[oklch(0.82_0.13_205)]"
            >
              {copy.badge}
            </Badge>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground">{copy.title}</h1>
            <p className="mt-3 text-sm leading-6 text-dim">{copy.body}</p>
          </div>
          <Button asChild size="lg" className="glow-cyan">
            <Link href={`/${locale}/admin/ai-providers`}>
              {copy.cta}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-4">
        {copy.stats.map(([label, value, Icon]) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-sm text-muted-foreground">{label}</CardTitle>
              <Icon className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="font-mono text-2xl font-semibold tabular-nums text-foreground">{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {copy.status.map(([label, value]) => (
          <StatusCard key={label} label={label} value={value} />
        ))}
      </div>

      <Card className="border-border/70">
        <CardHeader className="flex flex-row items-center gap-3">
          <Radar className="h-5 w-5 text-primary" />
          <CardTitle>{locale === "zh-CN" ? "下一步建议" : "Suggested next step"}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm leading-6 text-muted-foreground">
          {locale === "zh-CN"
            ? "先完成 Provider、Routing、Queue 和 System Health 的检查，再把高频采样任务切到新的异步链路，这样用户端看到的每个按钮都会对应真实后端执行能力。"
            : "Validate providers, routing, queues, and system health first, then move high-frequency sampling onto the new async pipeline so every visible button in the customer app maps to real backend execution."}
        </CardContent>
      </Card>
    </div>
  );
}

function StatusCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="font-mono text-2xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}
