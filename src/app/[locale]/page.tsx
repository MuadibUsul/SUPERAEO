import Link from "next/link";
import { ArrowRight, FileCheck2, FlaskConical, ScanSearch, Waypoints } from "lucide-react";

import { SiteHeader } from "@/components/layout/site-header";
import { PublicNebulaHero } from "@/components/marketing/public-nebula-hero";
import { Button } from "@/components/ui/button";
import { normalizeLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";

type PageProps = {
  params: Promise<{ locale: string }>;
};

// The hero renders the featured project's semantic field, which lives in the
// database and changes as audits materialize — so this page renders per request
// instead of freezing the field at build time. The read behind it is cached.
export const dynamic = "force-dynamic";

export default async function HomePage({ params }: PageProps) {
  const { locale: rawLocale } = await params;
  const locale = normalizeLocale(rawLocale);
  const dictionary = getDictionary(locale);
  const zh = locale === "zh-CN";
  const steps = zh
    ? [
        ["01", "采样", "冻结问题、模型、参数和时间，对真实调用进行可复测采样。"],
        ["02", "理解", "将模型回答映射为认知星云，区分拥有、缺失、混淆与竞争关系。"],
        ["03", "行动", "把高支持度的认知缺口转成可执行机会，不用黑箱分数替代证据。"],
        ["04", "验证", "用复测或准实验估计变化；未达协议时只给方向性结果。"],
      ]
    : [
        ["01", "Sample", "Freeze questions, models, settings, and time, then collect repeatable calls."],
        ["02", "Understand", "Map answers into a cognition nebula of ownership, gaps, confusion, and competition."],
        ["03", "Act", "Turn supported cognition gaps into actions without hiding evidence behind a score."],
        ["04", "Validate", "Estimate change through retests or quasi-experiments; underpowered work stays directional."],
      ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader locale={locale} variant="cosmic" />
      <main>
        <PublicNebulaHero locale={locale} hero={dictionary.homeHero} />

        <section id="how-it-works" className="mx-auto max-w-[1440px] scroll-mt-24 px-5 py-16 sm:px-8 lg:px-12">
          <div className="grid gap-12 lg:grid-cols-[0.72fr_1.28fr]">
            <div>
              <p className="eyebrow text-primary">{zh ? "从回答到证据" : "From answer to evidence"}</p>
              <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-balance sm:text-4xl">{zh ? "复杂的分析，清楚的下一步。" : "Complex analysis. A clear next step."}</h2>
              <p className="mt-5 max-w-md text-sm leading-7 text-muted-foreground">{zh ? "CIP 不声称读取模型内部状态。它记录指定模型在指定条件下如何回答，并让每个判断都能回到原始材料。" : "CIP does not claim access to hidden model state. It records how specified models answer under specified conditions and keeps every judgment traceable."}</p>
            </div>
            <div className="grid border-t border-border md:grid-cols-2">
              {steps.map(([index, title, body]) => <article key={index} className="border-b border-border py-6 md:odd:pr-8 md:even:border-l md:even:pl-8"><div className="font-mono text-xs text-primary">{index}</div><h3 className="mt-3 text-lg font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p></article>)}
            </div>
          </div>
        </section>

        <section className="border-y border-border bg-card/35">
          <div className="mx-auto grid max-w-[1440px] gap-px bg-border lg:grid-cols-3">
            <Value icon={ScanSearch} title={zh ? "可追溯观察" : "Traceable observation"} body={zh ? "保留问题、回答、模型参数、时间与响应哈希。" : "Retain questions, answers, model settings, time, and response hashes."} />
            <Value icon={Waypoints} title={zh ? "模型分歧可见" : "Visible disagreement"} body={zh ? "模型不一致时不合并成一个看似确定的答案。" : "Model disagreement remains visible instead of being averaged into false certainty."} />
            <Value icon={FileCheck2} title={zh ? "可验证报告" : "Verifiable reports"} body={zh ? "脱敏摘要通过 Ed25519 签名，可限时分享和撤销。" : "Redacted summaries are Ed25519-signed, time-limited, and revocable."} />
          </div>
        </section>

        <section className="mx-auto max-w-[1440px] px-5 py-24 sm:px-8 lg:px-12">
          <div className="panel-strong relative overflow-hidden p-8 sm:p-12 lg:flex lg:items-end lg:justify-between">
            <div className="max-w-3xl"><FlaskConical className="size-6 text-primary" /><h2 className="mt-5 text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">{zh ? "先观察，再行动，最后验证。" : "Observe first. Act second. Validate last."}</h2><p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground">{zh ? "从一次免费审计开始。样本不足时，系统会明确告诉你还不能得出什么。" : "Start with one audit. When evidence is insufficient, the system tells you what cannot yet be concluded."}</p></div>
            <Button asChild size="lg" className="mt-8 shrink-0 lg:mt-0"><Link href={`/${locale}/start`}>{zh ? "生成我的认知审计" : "Create my cognition audit"}<ArrowRight /></Link></Button>
          </div>
        </section>
      </main>
    </div>
  );
}

function Value({ icon: Icon, title, body }: { icon: typeof ScanSearch; title: string; body: string }) {
  return <article className="bg-background px-6 py-9 sm:px-10"><Icon className="size-5 text-primary" /><h3 className="mt-5 text-lg font-semibold">{title}</h3><p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{body}</p></article>;
}
