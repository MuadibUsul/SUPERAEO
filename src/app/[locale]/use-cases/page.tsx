import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { SiteHeader } from "@/components/layout/site-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { normalizeLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";

type PageProps = {
  params: Promise<{ locale: string }>;
};

export default async function UseCasesPage({ params }: PageProps) {
  const { locale: rawLocale } = await params;
  const locale = normalizeLocale(rawLocale);
  const dictionary = getDictionary(locale);
  const copy = dictionary.marketingPages.useCases;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader locale={locale} />
      <main className="relative isolate">
        <section className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-6xl items-center px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid w-full gap-6 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="panel-strong p-8 sm:p-10">
              <Badge variant="outline" className="border-primary/20 bg-primary/10 text-primary">
                {copy.badge}
              </Badge>
              <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight text-balance text-foreground sm:text-5xl">
                {dictionary.home.useCasesTitle}
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-dim">{copy.intro}</p>
              <Button asChild size="lg" className="mt-8">
                <Link href={`/${locale}/start`}>
                  {copy.cta}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>

            <div className="grid gap-4">
              {dictionary.useCases.map((item) => (
                <Card key={item.title}>
                  <CardHeader>
                    <CardTitle>{item.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm leading-6 text-dim">{item.body}</CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
