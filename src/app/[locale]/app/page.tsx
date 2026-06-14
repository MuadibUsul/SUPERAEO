import { redirect } from "next/navigation";

import { normalizeLocale } from "@/i18n/config";

type PageProps = {
  params: Promise<{ locale: string }>;
};

export default async function AppHomePage({ params }: PageProps) {
  const { locale: rawLocale } = await params;
  const locale = normalizeLocale(rawLocale);
  redirect(`/${locale}/app/projects`);
}
