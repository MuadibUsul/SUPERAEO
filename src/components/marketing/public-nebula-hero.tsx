import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { CognitionUniverse } from "@/components/semantic-intelligence/cognition-universe";
import { demoUniverseNodes } from "@/components/semantic-intelligence/demo-universe";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n/config";
import type { getDictionary } from "@/i18n/dictionaries";

export function PublicNebulaHero({ locale, hero }: { locale: Locale; hero: ReturnType<typeof getDictionary>["homeHero"] }) {
  const zh = locale === "zh-CN";
  return <section className="mx-auto max-w-[1440px] px-5 pb-12 pt-12 sm:px-8 lg:px-12 lg:pt-20">
    <div className="grid items-center gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-12">
      <div className="py-4 lg:pb-16">
        <p className="flex items-center gap-2 text-[11px] font-medium tracking-[0.12em] text-muted-foreground"><span className="size-1.5 rounded-full bg-primary" />COGNITION INTELLIGENCE PLATFORM</p>
        <h1 className="mt-7 text-[clamp(2.6rem,4.3vw,4.4rem)] font-semibold leading-[1.18] tracking-[-0.055em]">{zh ? <>从 AI 的回答里，<br />找到你的<span className="text-primary">下一步。</span></> : <>Find your next move<br />in <span className="text-primary">AI answers.</span></>}</h1>
        <p className="mt-6 max-w-lg text-base leading-8 text-muted-foreground">{zh ? "观察指定模型在指定问题和时间下如何描述你。看见认知缺口，回到原始证据，让优化有重点。" : "Observe how specified models describe you for selected questions and times. Find gaps, inspect the evidence, and focus your improvements."}</p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button asChild size="lg"><Link href={`/${locale}/start`}>{zh ? "开始我的分析" : "Start my analysis"}<ArrowRight /></Link></Button>
          <Link href="#how-it-works" className="inline-flex h-11 items-center gap-2 px-3 text-sm font-medium text-muted-foreground hover:text-foreground">{zh ? "了解工作流程" : "See how it works"}<ArrowUpRight className="size-4" /></Link>
        </div>
        <p className="mt-5 text-xs text-muted-foreground">{zh ? "品牌 · 人物 · 网站 · 产品" : "Brands · People · Websites · Products"}</p>
      </div>
      <div className="dark relative isolate h-[380px] overflow-hidden rounded-[24px] border border-white/10 bg-[#060911] text-white shadow-[0_24px_70px_-32px_rgba(39,29,85,0.45)] sm:h-[480px] lg:h-[550px]">
        <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between border-b border-white/10 px-5 py-4 text-[11px]"><span className="font-medium tracking-wide text-slate-200">{zh ? "认知星云" : "COGNITION NEBULA"}</span><span className="rounded-full border border-white/15 px-2 py-1 text-slate-400">{zh ? "演示数据" : "Demo data"}</span></div>
        <CognitionUniverse variant="ambient" nodes={demoUniverseNodes()} subjectName={zh ? "你的品牌" : "Your brand"} className="absolute inset-0 h-full w-full" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-[#060911] to-transparent px-5 pb-5 pt-20"><p className="text-sm font-medium">{zh ? "让分散的回答，呈现关系。" : "See the connections in scattered answers."}</p><p className="mt-2 text-[11px] leading-5 text-slate-400">{hero.demoLabel}</p></div>
      </div>
    </div>
    <div className="mt-10 grid gap-5 border-y border-border py-5 text-xs text-muted-foreground sm:grid-cols-3"><p><span className="mr-2 font-mono text-primary">01</span>{zh ? "每条判断，可追溯至回答" : "Trace judgments back to answers"}</p><p><span className="mr-2 font-mono text-primary">02</span>{zh ? "模型分歧与样本边界可见" : "Visible disagreement and sample limits"}</p><p><span className="mr-2 font-mono text-primary">03</span>{zh ? "从发现问题，到复测变化" : "From finding gaps to measuring change"}</p></div>
  </section>;
}
