import { AppShell } from "@/components/layout/app-shell";
import { normalizeLocale } from "@/i18n/config";
import { requirePageSession } from "@/server/auth/session";

export default async function CustomerAppLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = normalizeLocale(rawLocale);
  const session = await requirePageSession(locale);

  return (
    <AppShell locale={locale} session={session} mode="app">
      {children}
    </AppShell>
  );
}

