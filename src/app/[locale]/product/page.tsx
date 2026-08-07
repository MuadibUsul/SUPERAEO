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
        <section className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-6xl items-center px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid w-full gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="panel-strong p-8 sm:p-10">
              <Badge variant="outline" className="border-primary/20 bg-primary/10 text-primary">
                {copy.badge}
              </Badge>
              <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">{copy.title}</h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-dim">{copy.body}</p>
              <Button asChild size="lg" className="mt-8">
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
                        <Icon className="h-5 w-5 text-primary" />
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
