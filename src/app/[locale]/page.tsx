import { SiteHeader } from "@/components/layout/site-header";
import { PublicNebulaHero } from "@/components/marketing/public-nebula-hero";
import { normalizeLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";

type PageProps = {
  params: Promise<{ locale: string }>;
};

export default async function HomePage({ params }: PageProps) {
  const { locale: rawLocale } = await params;
  const locale = normalizeLocale(rawLocale);
  const dictionary = getDictionary(locale);

  return (
    <div className="dark cosmic-bg h-screen overflow-hidden text-foreground">
      <SiteHeader locale={locale} variant="cosmic" />
      <main className="h-[calc(100svh-3.5rem)] overflow-hidden">
        <PublicNebulaHero locale={locale} hero={dictionary.homeHero} />
      </main>
    </div>
  );
}
