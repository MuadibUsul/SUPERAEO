import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, LogIn, Sparkles } from "lucide-react";

import { SiteHeader } from "@/components/layout/site-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { normalizeLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { getCurrentSession, resolveSignedInDestination } from "@/server/auth/session";

type PageProps = {
  params: Promise<{ locale: string }>;
};

export default async function StartPage({ params }: PageProps) {
  const { locale: rawLocale } = await params;
  const locale = normalizeLocale(rawLocale);
  const dictionary = getDictionary(locale);
  const copy = dictionary.start;
  const session = await getCurrentSession();

  if (session) {
    redirect(
      await resolveSignedInDestination(
        {
          userId: session.user.id,
          role: session.role,
          organizationIds: session.user.memberships.map((membership) => membership.organizationId),
        },
        locale,
      ),
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader locale={locale} showPrimaryCta={false} />
      <main className="relative mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-5xl items-center px-4 py-12 sm:px-6 lg:px-8">
        <section className="panel-strong relative w-full p-6 md:p-9">
          <Badge variant="outline" className="border-primary/20 bg-primary/10 text-primary">
            <Sparkles className="mr-1 h-3.5 w-3.5" />
            {copy.badge}
          </Badge>
          <div className="mt-5 max-w-3xl">
            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-5xl">{copy.title}</h1>
            <p className="mt-4 text-base leading-7 text-dim">{copy.body}</p>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
            <div className="panel-inset p-4">
              <h2 className="text-base font-semibold text-foreground">{copy.signedOutTitle}</h2>
              <p className="mt-2 text-sm leading-6 text-dim">{copy.signedOutBody}</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row md:flex-col">
              <Button asChild size="lg">
                <Link href={`/${locale}/signup`}>
                  {copy.createAccount}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href={`/${locale}/login`}>
                  {copy.login}
                  <LogIn className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
