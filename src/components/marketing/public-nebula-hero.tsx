import Link from "next/link";
import { ArrowRight, CheckCircle2, ShieldCheck } from "lucide-react";

import { CognitionUniverse } from "@/components/semantic-intelligence/cognition-universe";
import { demoUniverseNodes } from "@/components/semantic-intelligence/demo-universe";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n/config";
import type { getDictionary } from "@/i18n/dictionaries";

type Dictionary = ReturnType<typeof getDictionary>;

export function PublicNebulaHero({
  locale,
  hero,
}: {
  locale: Locale;
  hero: Dictionary["homeHero"];
}) {
  const zh = locale === "zh-CN";
  return (
    <section
      aria-label={hero.title}
      className="relative min-h-[720px] overflow-hidden border-b border-white/8 bg-background"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_74%_42%,rgba(33,184,211,0.09)_0%,transparent_30%),radial-gradient(circle_at_82%_58%,rgba(123,80,210,0.08)_0%,transparent_34%)]" />
      <div className="absolute inset-y-0 right-0 w-full lg:w-[66%]">
        <CognitionUniverse variant="ambient" nodes={demoUniverseNodes()} subjectName={zh ? "你的品牌" : "Your brand"} className="absolute inset-0 h-full w-full" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,var(--background)_0%,color-mix(in_oklch,var(--background)_86%,transparent)_18%,transparent_52%),linear-gradient(180deg,var(--background)_0%,transparent_20%,transparent_75%,var(--background)_100%)]" />
      </div>

      <div className="relative z-20 mx-auto flex min-h-[720px] max-w-[1440px] items-center px-5 py-20 sm:px-8 lg:px-12">
        <div className="max-w-[650px] lg:w-[48%]">
          <div className="eyebrow inline-flex items-center gap-2 rounded-md border border-primary/20 bg-primary/8 px-2.5 py-1.5 text-primary">
            <span className="size-1.5 rounded-full bg-primary shadow-[0_0_10px_var(--primary)]" />
            Cognition Intelligence Platform
          </div>
          <h1 className="mt-7 text-[clamp(2.8rem,5vw,4.6rem)] font-semibold leading-[1.01] tracking-[-0.06em] text-foreground">
            {zh ? (
              <>
                <span className="block whitespace-nowrap">观察指定 AI 模型</span>
                <span className="block">如何描述你。</span>
              </>
            ) : (
              <span className="text-balance">{hero.title}</span>
            )}
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">{hero.subtitle}</p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button asChild size="lg">
              <Link href={`/${locale}/start`}>{zh ? "开始认知审计" : "Start an audit"}<ArrowRight /></Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href={`/${locale}/methodology`}>{zh ? "查看方法与边界" : "Read the methodology"}</Link>
            </Button>
          </div>
          <div className="mt-9 grid max-w-xl gap-3 border-t border-border pt-5 text-xs leading-5 text-muted-foreground sm:grid-cols-2">
            <p className="flex gap-2"><CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" />{zh ? "结论可追溯到模型回答与来源" : "Claims trace back to answers and sources"}</p>
            <p className="flex gap-2"><ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-primary" />{zh ? "低样本自动拒绝强结论" : "Low samples block strong conclusions"}</p>
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute right-5 bottom-5 z-20 hidden rounded-md border border-border bg-background/70 px-3 py-2 text-[10px] text-muted-foreground backdrop-blur-md lg:block">
        <span className="font-mono text-primary">LIVE DEMO</span> · {hero.demoLabel}
      </div>
    </section>
  );
}
