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
    <div className="mx-auto w-full max-w-6xl space-y-7">
      <div className="border-b border-border pb-6">
        <p className="eyebrow text-primary">{copy.eyebrow}</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.045em] text-foreground">{copy.title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{copy.subtitle}</p>
      </div>
      <ProjectForm locale={locale} />
    </div>
  );
}
