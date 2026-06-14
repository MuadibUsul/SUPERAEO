import { AppShell } from "@/components/layout/app-shell";
import { normalizeLocale } from "@/i18n/config";
import { requireAdminPageSession } from "@/server/auth/session";

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = normalizeLocale(rawLocale);
  const session = await requireAdminPageSession(locale);

  return (
    <AppShell locale={locale} session={session} mode="admin">
      {children}
    </AppShell>
  );
}

