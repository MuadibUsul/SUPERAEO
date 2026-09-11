import { TrustPage } from "@/components/marketing/trust-page"; import { normalizeLocale } from "@/i18n/config";
export default async function Page({ params }: { params: Promise<{ locale: string }> }) { return <TrustPage locale={normalizeLocale((await params).locale)} kind="methodology" />; }
