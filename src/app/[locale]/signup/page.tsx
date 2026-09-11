import { AuthForm } from "@/components/auth/auth-form";
import { SiteHeader } from "@/components/layout/site-header";
import { normalizeLocale } from "@/i18n/config";

type PageProps = {
  params: Promise<{ locale: string }>;
};

export default async function SignupPage({ params }: PageProps) {
  const { locale: rawLocale } = await params;
  const locale = normalizeLocale(rawLocale);

  return (
    <div className="min-h-screen">
      <SiteHeader locale={locale} />
      <main className="app-canvas flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12 sm:px-6">
        <AuthForm mode="signup" locale={locale} />
      </main>
    </div>
  );
}
