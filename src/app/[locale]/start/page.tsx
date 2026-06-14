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
    <div className="min-h-screen bg-[#030614] text-white">
      <SiteHeader locale={locale} showPrimaryCta={false} variant="cosmic" />
      <main className="relative mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-5xl items-center px-4 py-12 sm:px-6 lg:px-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_25%,rgba(251,191,36,0.18),transparent_30%),radial-gradient(circle_at_78%_68%,rgba(34,211,238,0.14),transparent_34%)]" />
        <section className="relative w-full rounded-lg border border-white/10 bg-white/[0.045] p-6 shadow-[0_30px_120px_rgba(0,0,0,0.45)] backdrop-blur md:p-9">
          <Badge className="border-amber-200/20 bg-amber-200/10 text-amber-100" variant="outline">
            <Sparkles className="mr-1 h-3.5 w-3.5" />
            {copy.badge}
          </Badge>
          <div className="mt-5 max-w-3xl">
            <h1 className="text-3xl font-semibold tracking-normal text-white sm:text-5xl">{copy.title}</h1>
            <p className="mt-4 text-base leading-7 text-white/64">{copy.body}</p>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
            <div className="rounded-lg border border-white/10 bg-black/18 p-4">
              <h2 className="text-base font-semibold text-white">{copy.signedOutTitle}</h2>
              <p className="mt-2 text-sm leading-6 text-white/58">{copy.signedOutBody}</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row md:flex-col">
              <Button asChild className="bg-amber-100 text-slate-950 hover:bg-amber-50">
                <Link href={`/${locale}/signup`}>
                  {copy.createAccount}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="border-white/15 bg-white/6 text-white hover:bg-white/12 hover:text-white">
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
