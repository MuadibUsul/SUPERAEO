"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Locale } from "@/i18n/config";
import { CipMark } from "@/components/brand/cip-mark";

export function SiteFooter({ locale }: { locale: Locale }) {
  const pathname = usePathname();
  if (pathname.startsWith(`/${locale}/app`) || pathname.startsWith(`/${locale}/admin`)) return null;
  const zh = locale === "zh-CN";
  const links = [["methodology", zh ? "方法论" : "Methodology"], ["security", zh ? "安全" : "Security"], ["privacy", zh ? "隐私" : "Privacy"], ["changelog", zh ? "更新记录" : "Changelog"], ["benchmarks", zh ? "基准测试" : "Benchmarks"], ["case-studies", zh ? "案例" : "Case studies"]];
  return <footer className="mt-auto border-t border-border bg-card">
    <div className="mx-auto flex max-w-[1440px] flex-col gap-7 px-5 py-10 sm:px-8 lg:flex-row lg:items-start lg:justify-between lg:px-12">
      <div><Link href={`/${locale}`} className="flex items-center gap-2 text-sm font-semibold"><CipMark size={20} />CIP</Link><p className="mt-3 max-w-sm text-xs leading-6 text-muted-foreground">{zh ? "观测有边界，判断有依据。只描述指定条件下的模型抽样表现。" : "Bounded observations, traceable judgments. Describing model samples under specified conditions."}</p></div>
      <nav aria-label={zh ? "信任中心" : "Trust center"} className="grid grid-cols-3 gap-x-6 gap-y-4 text-xs text-muted-foreground sm:flex sm:flex-wrap sm:gap-6">{links.map(([path, label]) => <Link key={path} href={`/${locale}/${path}`} className="hover:text-foreground">{label}</Link>)}</nav>
    </div>
  </footer>;
}
