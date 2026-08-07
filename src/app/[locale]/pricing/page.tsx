import Link from "next/link";
import { ArrowRight, Check, FlaskConical } from "lucide-react";

import { SiteHeader } from "@/components/layout/site-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { normalizeLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { formatLimit, getPlan, getPlanCopy, PLAN_ORDER } from "@/server/billing/plans";
import type { OrganizationPlan } from "@/generated/prisma/client";

export const dynamic = "force-static";

type PageProps = {
  params: Promise<{ locale: string }>;
};

export default async function PricingPage({ params }: PageProps) {
  const { locale: rawLocale } = await params;
  const locale = normalizeLocale(rawLocale);
  const dictionary = getDictionary(locale);
  const planCopy = getPlanCopy(locale);
  const zh = locale === "zh-CN";

  const recommended: OrganizationPlan = "pro";
  const heroTitle = zh ? "为「证明 AI 认知改善」而设计的定价" : "Pricing built to prove AI cognition improves";
  const heroSubtitle = zh
    ? "从一次免费审计开始。当你需要持续监测、并用处理/对照实验证明是你的内容起了作用时，再升级。"
    : "Start with a free audit. Upgrade when you need continuous monitoring and treatment/control experiments that prove your content — not model drift — moved the needle.";
  const planName: Record<OrganizationPlan, string> = { free: planCopy.free, pro: planCopy.pro, scale: planCopy.scale };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader locale={locale} />
      <main className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <Badge variant="outline" className="gap-1.5 border-primary/20 bg-primary/10 text-primary">
            {zh ? "定价" : "Pricing"}
          </Badge>
          <h1 className="mt-5 text-4xl font-semibold leading-[1.1] tracking-tight text-balance text-foreground md:text-5xl">{heroTitle}</h1>
          <p className="mt-4 text-base leading-7 text-dim">{heroSubtitle}</p>
        </div>

        <div className="mt-14 grid gap-5 lg:grid-cols-3">
          {PLAN_ORDER.map((planId) => {
            const plan = getPlan(planId);
            const isRecommended = planId === recommended;
            return (
              <div
                key={planId}
                className={
                  isRecommended
                    ? "panel-strong relative flex flex-col p-7 ring-1 ring-primary/40"
                    : "panel relative flex flex-col p-7"
                }
              >
                {isRecommended ? (
                  <span className="absolute -top-3 left-7 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground shadow-sm">
                    {zh ? "最受欢迎" : "Most popular"}
                  </span>
                ) : null}
                <h2 className="text-lg font-semibold text-foreground">{planName[planId]}</h2>
                <p className="mt-1 min-h-10 text-sm leading-6 text-dim">{planCopy.taglines[planId]}</p>
                <div className="mt-5 flex items-end gap-1">
                  {plan.priceUsd === null ? (
                    <span className="text-3xl font-semibold text-foreground">{planCopy.contact}</span>
                  ) : (
                    <>
                      <span className="font-mono text-4xl font-semibold text-foreground">${plan.priceUsd}</span>
                      <span className="pb-1 text-sm text-faint">{planCopy.perMonth}</span>
                    </>
                  )}
                </div>

                <Button
                  asChild
                  size="lg"
                  variant={isRecommended ? "default" : "outline"}
                  className="mt-6"
                >
                  <Link href={`/${locale}/start`}>
                    {planId === "free" ? (zh ? "免费开始" : "Start free") : planId === "scale" ? planCopy.contact : zh ? "升级到专业版" : "Upgrade to Pro"}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>

                <div className="mt-7 grid gap-2.5 border-t border-border pt-6">
                  {(Object.keys(plan.limits) as Array<keyof typeof plan.limits>).map((key) => (
                    <div key={key} className="flex items-center justify-between text-sm">
                      <span className="text-dim">{planCopy.limitLabels[key]}</span>
                      <span className="font-mono text-foreground">{formatLimit(plan.limits[key], locale)}</span>
                    </div>
                  ))}
                </div>

                <ul className="mt-6 space-y-2.5">
                  {plan.featureKeys.map((featureKey) => (
                    <li key={featureKey} className="flex items-start gap-2.5 text-sm text-dim">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                      {planCopy.features[featureKey] ?? featureKey}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        <div className="panel mt-10 flex flex-col items-start gap-4 p-7 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <FlaskConical className="mt-0.5 h-6 w-6 shrink-0 text-primary" />
            <div>
              <h3 className="text-base font-semibold text-foreground">
                {zh ? "为什么不只是另一个 AI 排名工具？" : "Why this isn't just another AI rank tracker"}
              </h3>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-dim">
                {zh
                  ? "Pro 及以上提供因果验证：把问题分成处理组与对照组，扣除模型漂移，证明是你的干预带来了净提升——并把 AI 可见度和真实业务结果挂钩。"
                  : "Pro and up include the Proof layer: treatment/control experiments that remove model drift to show your intervention caused the lift — and tie AI visibility to real business outcomes."}
              </p>
            </div>
          </div>
          <Button asChild variant="outline" className="shrink-0">
            <Link href={`/${locale}/product`}>
              {dictionary.nav.product}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
