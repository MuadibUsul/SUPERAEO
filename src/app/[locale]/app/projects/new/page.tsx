import { ProjectForm } from "@/components/project/project-form";
import { normalizeLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";

type PageProps = {
  params: Promise<{ locale: string }>;
};

export default async function NewProjectPage({ params }: PageProps) {
  const { locale: rawLocale } = await params;
  const locale = normalizeLocale(rawLocale);
  const dictionary = getDictionary(locale);
  const copy = dictionary.projectWizard;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.22em] text-amber-200/70">{copy.eyebrow}</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-normal text-white">{copy.title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-white/58">{copy.subtitle}</p>
      </div>
      <ProjectForm locale={locale} />
    </div>
  );
}
