import Link from "next/link";
import { ArrowRight, ChartSpline, Radar, ShieldCheck } from "lucide-react";

import { SiteHeader } from "@/components/layout/site-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { normalizeLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";

type PageProps = {
  params: Promise<{ locale: string }>;
};

const icons = [ChartSpline, Radar, ShieldCheck] as const;

export default async function ProductPage({ params }: PageProps) {
  const { locale: rawLocale } = await params;
  const locale = normalizeLocale(rawLocale);
  const dictionary = getDictionary(locale);
  const copy = dictionary.marketingPages.product;

  return (
    <div className="dark cosmic-bg min-h-screen text-foreground">
      <div className="pointer-events-none fixed inset-0 -z-10 starfield opacity-60" aria-hidden />
      <SiteHeader locale={locale} variant="cosmic" />
      <main className="relative isolate">
        <section className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-6xl items-center px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid w-full gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="panel-strong p-8 sm:p-10">
              <Badge variant="outline" className="border-[oklch(0.85_0.15_85/25%)] bg-[oklch(0.85_0.15_85/10%)] text-[oklch(0.85_0.15_85)]">
                {copy.badge}
              </Badge>
              <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">{copy.title}</h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-dim">{copy.body}</p>
              <Button asChild size="lg" className="mt-8 glow-gold">
                <Link href={`/${locale}/start`}>
                  {dictionary.nav.start}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>

            <div className="grid gap-4">
              {copy.cards.map((item, index) => {
                const Icon = icons[index] ?? ShieldCheck;
                return (
                  <Card key={item.title}>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg text-foreground">
                        <Icon className="h-5 w-5 text-[oklch(0.85_0.15_85)]" />
                        {item.title}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm leading-6 text-dim">{item.body}</CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
