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
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader locale={locale} />
      <main className="relative isolate">
        <section className="mx-auto max-w-[1320px] px-5 py-20 sm:px-8 lg:px-12 lg:py-28">
          <div className="grid w-full gap-14 lg:grid-cols-[0.92fr_1.08fr] lg:items-center">
            <div>
              <Badge variant="outline" className="border-primary/20 bg-primary/10 text-primary">
                {copy.badge}
              </Badge>
              <h1 className="mt-6 max-w-3xl text-4xl font-semibold tracking-[-0.05em] text-balance text-foreground sm:text-6xl">{copy.title}</h1>
              <p className="mt-6 max-w-2xl text-base leading-8 text-muted-foreground">{copy.body}</p>
              <Button asChild size="lg" className="mt-8">
                <Link href={`/${locale}/start`}>
                  {dictionary.nav.start}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>

            <div className="grid border-t border-border">
              {copy.cards.map((item, index) => {
                const Icon = icons[index] ?? ShieldCheck;
                return (
                  <Card key={item.title} className="rounded-none border-x-0 border-t-0 bg-transparent py-7 shadow-none">
                    <CardHeader className="px-0">
                      <CardTitle className="flex items-center gap-2 text-lg text-foreground">
                        <Icon className="h-5 w-5 text-primary" />
                        {item.title}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-0 text-sm leading-7 text-muted-foreground">{item.body}</CardContent>
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
