import { redirect } from "next/navigation";

import { normalizeLocale } from "@/i18n/config";

type PageProps = {
  params: Promise<{ locale: string; projectId: string }>;
};

export default async function ProjectIndexPage({ params }: PageProps) {
  const { locale: rawLocale, projectId } = await params;
  redirect(`/${normalizeLocale(rawLocale)}/app/projects/${projectId}/dashboard`);
}

