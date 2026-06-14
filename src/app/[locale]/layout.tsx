import { notFound } from "next/navigation";

import { isLocale, type Locale } from "@/i18n/config";

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  return children;
}

export function generateStaticParams(): { locale: Locale }[] {
  return [{ locale: "zh-CN" }, { locale: "en" }];
}

