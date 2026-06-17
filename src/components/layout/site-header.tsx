import Link from "next/link";
import { ArrowRight, Network } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n/config";
import { LOCALES } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { cn } from "@/lib/utils";

export function SiteHeader({
  locale,
  variant = "default",
  showPrimaryCta = true,
}: {
  locale: Locale;
  variant?: "default" | "cosmic";
  showPrimaryCta?: boolean;
}) {
  const dictionary = getDictionary(locale);
  const alternateLocale = LOCALES.find((item) => item !== locale) ?? "en";
  const isCosmic = variant === "cosmic";

  return (
    <header
      className={cn(
        "sticky top-0 z-30 border-b backdrop-blur-xl",
        isCosmic ? "dark border-border bg-background/40 text-foreground" : "border-border bg-background/90",
      )}
    >
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href={`/${locale}`} className="group flex items-center gap-2 font-semibold tracking-tight">
          <span
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg transition-transform group-hover:scale-105",
              isCosmic
                ? "bg-gradient-to-br from-gold via-cyan to-violet text-[oklch(0.18_0.04_264)] glow-gold"
                : "bg-primary text-primary-foreground",
            )}
          >
            <Network className="h-4 w-4" />
          </span>
          <span className={cn(isCosmic && "text-aurora")}>CIP</span>
        </Link>

        <nav className="hidden items-center gap-5 text-sm text-muted-foreground md:flex">
          <Link href={`/${locale}/product`} className="transition-colors hover:text-foreground">
            {dictionary.nav.product}
          </Link>
          <Link href={`/${locale}/use-cases`} className="transition-colors hover:text-foreground">
            {dictionary.nav.useCases}
          </Link>
          <Link href={`/${locale}/pricing`} className="transition-colors hover:text-foreground">
            {dictionary.nav.pricing}
          </Link>
          <Link href={`/${alternateLocale}`} className="transition-colors hover:text-foreground">
            {alternateLocale === "zh-CN" ? "中文" : "English"}
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" className="hidden sm:inline-flex">
            <Link href={`/${locale}/login`}>{dictionary.nav.login}</Link>
          </Button>
          {showPrimaryCta ? (
            <Button asChild size="lg" className={cn(isCosmic && "glow-gold")}>
              <Link href={`/${locale}/start`}>
                {dictionary.nav.start}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
