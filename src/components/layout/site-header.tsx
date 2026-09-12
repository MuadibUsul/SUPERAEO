import Link from "next/link";
import { ArrowRight, Menu } from "lucide-react";
import { CipMark } from "@/components/brand/cip-mark";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";

export function SiteHeader({ locale, showPrimaryCta = true }: { locale: Locale; variant?: "default" | "cosmic"; showPrimaryCta?: boolean }) {
  const dictionary = getDictionary(locale);
  const alternateLocale = locale === "en" ? "zh-CN" : "en";
  const links = [["product", dictionary.nav.product], ["use-cases", dictionary.nav.useCases], ["pricing", dictionary.nav.pricing], ["methodology", locale === "zh-CN" ? "方法与信任" : "Methodology"]];
  return <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur-md">
    <div className="mx-auto flex h-[72px] max-w-[1440px] items-center justify-between gap-4 px-5 sm:px-8 lg:px-12">
      <Link href={`/${locale}`} className="flex shrink-0 items-center gap-2.5"><span className="flex size-8 items-center justify-center rounded-lg bg-foreground text-background"><CipMark size={22} /></span><span className="text-xl font-semibold tracking-tight">CIP</span></Link>
      <nav aria-label={locale === "zh-CN" ? "主导航" : "Main navigation"} className="hidden items-center gap-7 text-[13px] text-muted-foreground md:flex">{links.map(([href,label]) => <Link key={href} href={`/${locale}/${href}`} className="hover:text-foreground">{label}</Link>)}</nav>
      <div className="flex items-center gap-2">
        <Link href={`/${alternateLocale}`} className="hidden px-2 text-xs text-muted-foreground lg:block">{alternateLocale === "en" ? "EN" : "中文"}</Link>
        <Button asChild variant="ghost" size="sm"><Link href={`/${locale}/login`}>{dictionary.nav.login}</Link></Button>
        {showPrimaryCta ? <Button asChild className="hidden sm:inline-flex"><Link href={`/${locale}/start`}>{locale === "zh-CN" ? "开始分析" : "Get started"}<ArrowRight className="size-4" /></Link></Button> : null}
        <details className="md:hidden"><summary aria-label={locale === "zh-CN" ? "打开菜单" : "Open menu"} className="flex size-10 cursor-pointer list-none items-center justify-center rounded-lg border border-border"><Menu className="size-4" /></summary><nav className="absolute inset-x-0 top-[72px] grid gap-1 border-b border-border bg-card p-5 shadow-md">{links.map(([href,label]) => <Link key={href} href={`/${locale}/${href}`} className="rounded-lg p-3 text-sm hover:bg-muted">{label}</Link>)}<Link href={`/${alternateLocale}`} className="p-3 text-sm">{alternateLocale === "en" ? "English" : "中文"}</Link><Link href={`/${locale}/start`} className="rounded-lg bg-primary p-3 text-center text-sm text-primary-foreground">{dictionary.nav.start}</Link></nav></details>
      </div>
    </div>
  </header>;
}
