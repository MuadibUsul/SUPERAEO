/**
 * Plan definitions — the single source of truth for both the public pricing
 * page and in-app quota enforcement. Keep prices and limits here only.
 */
import type { OrganizationPlan } from "@/generated/prisma/client";
import type { Locale } from "@/i18n/config";

export type PlanLimits = {
  /** Max active projects in the organization. */
  projects: number;
  /** Diagnosis runs allowed per calendar month. */
  auditsPerMonth: number;
  /** Controlled proof experiments (total). */
  experiments: number;
  /** Member seats. */
  seats: number;
};

export type PlanDefinition = {
  id: OrganizationPlan;
  /** Monthly price in USD; null means "contact us". */
  priceUsd: number | null;
  limits: PlanLimits;
  featureKeys: string[];
};

/** Unlimited sentinel — large enough to never bite, still finite for math/UI. */
export const UNLIMITED = 1_000_000;

export const PLANS: Record<OrganizationPlan, PlanDefinition> = {
  free: {
    id: "free",
    priceUsd: 0,
    limits: { projects: 1, auditsPerMonth: 2, experiments: 0, seats: 1 },
    featureKeys: ["nebula", "opportunities", "evidence", "communitySupport"],
  },
  pro: {
    id: "pro",
    priceUsd: 149,
    limits: { projects: 5, auditsPerMonth: 30, experiments: 10, seats: 5 },
    featureKeys: ["everythingFree", "proof", "ga4", "report", "emailSupport"],
  },
  scale: {
    id: "scale",
    priceUsd: 599,
    limits: { projects: 50, auditsPerMonth: 400, experiments: UNLIMITED, seats: 25 },
    featureKeys: ["everythingPro", "api", "sso", "prioritySupport", "customProviders"],
  },
};

export const PLAN_ORDER: OrganizationPlan[] = ["free", "pro", "scale"];

export function getPlan(plan: OrganizationPlan): PlanDefinition {
  return PLANS[plan] ?? PLANS.free;
}

/** Localized, presentation-only copy for plans (names, taglines, feature labels). */
export function getPlanCopy(locale: Locale) {
  const zh = locale === "zh-CN";
  return {
    perMonth: zh ? "/月" : "/mo",
    contact: zh ? "联系我们" : "Contact us",
    free: zh ? "免费版" : "Free",
    pro: zh ? "专业版" : "Pro",
    scale: zh ? "规模版" : "Scale",
    taglines: {
      free: zh ? "先看看 AI 怎么理解你" : "See how AI understands you",
      pro: zh ? "持续监测，并证明你的干预有效" : "Monitor continuously and prove your impact",
      scale: zh ? "为团队和代理商提供规模化与集成" : "Scale, integrations, and control for teams & agencies",
    } as Record<OrganizationPlan, string>,
    limitLabels: {
      projects: zh ? "审计项目" : "Projects",
      auditsPerMonth: zh ? "每月诊断次数" : "Audits / month",
      experiments: zh ? "受控实验" : "Proof experiments",
      seats: zh ? "成员席位" : "Seats",
    } as Record<keyof PlanLimits, string>,
    features: {
      nebula: zh ? "语义星云与机会板" : "Semantic nebula & opportunity board",
      opportunities: zh ? "长尾机会与问题领地" : "Long-tail opportunities & territory",
      evidence: zh ? "统一证据抽屉" : "Unified evidence drawer",
      communitySupport: zh ? "社区支持" : "Community support",
      everythingFree: zh ? "包含免费版全部功能" : "Everything in Free",
      proof: zh ? "因果验证（处理/对照 + 净提升）" : "Proof layer (treatment/control net lift)",
      ga4: zh ? "GA4 / 真实结果相关性" : "GA4 / real-outcome correlation",
      report: zh ? "可分享的咨询式报告" : "Shareable consulting-grade reports",
      emailSupport: zh ? "邮件支持" : "Email support",
      everythingPro: zh ? "包含专业版全部功能" : "Everything in Pro",
      api: zh ? "API 访问" : "API access",
      sso: zh ? "SSO / SAML" : "SSO / SAML",
      prioritySupport: zh ? "优先支持与 SLA" : "Priority support & SLA",
      customProviders: zh ? "自定义 AI Provider 与路由" : "Custom AI providers & routing",
    } as Record<string, string>,
  };
}

export function formatLimit(value: number, locale: Locale): string {
  if (value >= UNLIMITED) return locale === "zh-CN" ? "无限" : "Unlimited";
  return String(value);
}
