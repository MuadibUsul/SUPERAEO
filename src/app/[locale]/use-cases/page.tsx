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
    <div className="min-h-screen bg-[#030614] text-white">
      <SiteHeader locale={locale} variant="cosmic" />
      <main className="relative isolate">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_22%_16%,rgba(251,191,36,0.14),transparent_24%),radial-gradient(circle_at_80%_24%,rgba(34,211,238,0.12),transparent_28%),linear-gradient(180deg,#030614_0%,#070b18_100%)]" />
        <section className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-6xl items-center px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid w-full gap-6 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="rounded-[30px] border border-white/10 bg-white/[0.045] p-8 shadow-[0_40px_140px_rgba(0,0,0,0.34)] backdrop-blur-xl sm:p-10">
              <Badge className="border-amber-200/20 bg-amber-200/10 text-amber-100" variant="outline">
                {copy.badge}
              </Badge>
              <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-normal text-white sm:text-5xl">
                {dictionary.home.useCasesTitle}
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-white/64">{copy.intro}</p>
              <Button asChild className="mt-8 bg-amber-100 text-slate-950 hover:bg-amber-50">
                <Link href={`/${locale}/start`}>
                  {copy.cta}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>

            <div className="grid gap-4">
              {dictionary.useCases.map((item) => (
                <Card
                  key={item.title}
                  className="border-white/10 bg-white/[0.045] text-white shadow-[0_24px_80px_rgba(0,0,0,0.2)]"
                >
                  <CardHeader>
                    <CardTitle>{item.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm leading-6 text-white/62">{item.body}</CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
