"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Building2, Globe2, Loader2, PackageCheck, UserRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { buildAuditNamePreview, getComparisonCategory } from "@/components/project/project-form-helpers";
import type { Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { cn } from "@/lib/utils";

type EntityType = "BRAND" | "PERSON" | "WEBSITE" | "PRODUCT";
type WizardLocale = "zh-CN" | "en";

const entityTypes: { key: EntityType; icon: typeof Building2 }[] = [
  { key: "BRAND", icon: Building2 },
  { key: "PERSON", icon: UserRound },
  { key: "WEBSITE", icon: Globe2 },
  { key: "PRODUCT", icon: PackageCheck },
];

export function ProjectForm({ locale = "zh-CN" }: { locale?: string }) {
  const safeLocale: Locale = locale === "en" ? "en" : "zh-CN";
  const dictionary = getDictionary(safeLocale);
  const copy = dictionary.projectWizard;
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [entityType, setEntityType] = useState<EntityType>("BRAND");
  const [projectName, setProjectName] = useState("");
  const [subjectName, setSubjectName] = useState("");
  const [domain, setDomain] = useState("");
  const [industry, setIndustry] = useState("");
  const [targetMarket, setTargetMarket] = useState("");
  const [desiredUnderstanding, setDesiredUnderstanding] = useState("");
  const [language, setLanguage] = useState(safeLocale === "zh-CN" ? "zh-CN" : "en");
  const [competitors, setCompetitors] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const contextConfig = getEntityContextConfig(safeLocale, entityType, copy);
  const requiresWebsite = entityType === "WEBSITE";
  const generatedProjectName = generateProjectNamePreview(subjectName.trim(), language, copy);
  const comparisonCategory = getComparisonCategory(entityType);

  const canContinue = useMemo(() => {
    if (step === 0) return true;
    if (step === 1) {
      const hasCoreContext =
        subjectName.trim().length > 0 &&
        industry.trim().length > 0 &&
        targetMarket.trim().length > 0;
      return requiresWebsite ? hasCoreContext && domain.trim().length > 0 : hasCoreContext;
    }

    return subjectName.trim().length > 0;
  }, [domain, industry, requiresWebsite, step, subjectName, targetMarket]);

  async function submit() {
    setFormError(null);
    setIsSubmitting(true);

    const response = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entityType,
        name: projectName.trim(),
        subjectName: subjectName.trim(),
        websiteUrl: domain.trim(),
        category: industry.trim(),
        market: targetMarket.trim() || desiredUnderstanding.trim() || industry.trim(),
        comparisons: competitors
          .split(/[,锛屻€乗n]/u)
          .map((name) => name.trim())
          .filter(Boolean)
          .map((name) => ({ name, domain: "", category: comparisonCategory })),

        // Legacy aliases accepted by older API consumers.
        brandName: subjectName.trim(),
        domain: domain.trim(),
        industry: industry.trim(),
        targetMarket: targetMarket.trim() || desiredUnderstanding.trim() || industry.trim(),
        desiredUnderstanding: desiredUnderstanding.trim(),
        language,
        competitors: competitors
          .split(/[,，、\n]/u)
          .map((name) => name.trim())
          .filter(Boolean)
          .map((name) => ({ name, domain: "", category: comparisonCategory })),
      }),
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      setIsSubmitting(false);
      setFormError(payload?.error ?? copy.error);
      return;
    }

    const projectId = payload.project.id as string;
    const diagnosis = await fetch(`/api/projects/${projectId}/diagnosis/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    if (!diagnosis.ok) {
      const diagnosisPayload = await diagnosis.json().catch(() => null);
      setIsSubmitting(false);
      setFormError(diagnosisPayload?.error ?? copy.error);
      return;
    }

    router.push(`/${safeLocale}/app/projects/${projectId}/dashboard`);
  }

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.045] p-4 text-white shadow-[0_30px_120px_rgba(0,0,0,0.3)] backdrop-blur md:p-6">
      <div className="grid gap-2 sm:grid-cols-3">
        {copy.steps.map((label, index) => (
          <div
            key={label}
            className={cn(
              "rounded-md border px-3 py-2 text-sm",
              index === step
                ? "border-amber-200/35 bg-amber-200/10 text-amber-100"
                : index < step
                  ? "border-cyan-200/20 bg-cyan-200/8 text-cyan-100/80"
                  : "border-white/10 bg-black/12 text-white/42",
            )}
          >
            <span className="font-mono text-xs">{String(index + 1).padStart(2, "0")}</span>
            <span className="ml-2">{label}</span>
          </div>
        ))}
      </div>

      <div className="mt-6">
        {step === 0 ? (
          <section>
            <h2 className="text-lg font-semibold">{copy.entityType}</h2>
            <p className="mt-2 text-sm leading-6 text-white/58">{copy.entityHelp}</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {entityTypes.map((item) => {
                const Icon = item.icon;
                const active = item.key === entityType;
                return (
                  <button
                    key={item.key}
                    type="button"
                    className={cn(
                      "rounded-lg border p-4 text-left transition",
                      active
                        ? "border-amber-200/38 bg-amber-200/10 shadow-[0_0_42px_rgba(251,191,36,0.08)]"
                        : "border-white/10 bg-black/16 hover:border-white/20 hover:bg-white/[0.06]",
                    )}
                    onClick={() => setEntityType(item.key)}
                  >
                    <Icon className={cn("h-5 w-5", active ? "text-amber-100" : "text-cyan-100/70")} />
                    <div className="mt-4 font-medium">{copy.types[item.key]}</div>
                    <p className="mt-2 text-sm leading-6 text-white/54">{copy.typeDescriptions[item.key]}</p>
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        {step === 1 ? (
          <section className="grid gap-5">
            <div>
              <h2 className="text-lg font-semibold">{copy.minimalContext}</h2>
              <p className="mt-2 text-sm leading-6 text-white/58">{copy.contextGuides[entityType]}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={contextConfig.subjectLabel}>
                <Input
                  value={subjectName}
                  onChange={(event) => setSubjectName(event.target.value)}
                  placeholder={contextConfig.subjectPlaceholder}
                />
              </Field>
              <Field label={contextConfig.websiteLabel} optional={!requiresWebsite} required={requiresWebsite} optionalLabel={contextConfig.optionalLabel}>
                <Input
                  value={domain}
                  onChange={(event) => setDomain(event.target.value)}
                  placeholder={contextConfig.websitePlaceholder}
                />
              </Field>
              <Field label={contextConfig.categoryLabel}>
                <Input
                  value={industry}
                  onChange={(event) => setIndustry(event.target.value)}
                  placeholder={contextConfig.categoryPlaceholder}
                />
              </Field>
              <Field label={copy.language}>
                <Input value={language} onChange={(event) => setLanguage(event.target.value)} placeholder="en" />
              </Field>
            </div>
            <Field label={contextConfig.audienceLabel}>
              <Textarea
                value={targetMarket}
                onChange={(event) => setTargetMarket(event.target.value)}
                rows={3}
                placeholder={contextConfig.audiencePlaceholder}
              />
            </Field>
            <Field label={copy.desiredUnderstanding}>
              <Textarea
                value={desiredUnderstanding}
                onChange={(event) => setDesiredUnderstanding(event.target.value)}
                rows={4}
                placeholder={copy.desiredPlaceholder}
              />
            </Field>
          </section>
        ) : null}

        {step === 2 ? (
          <section className="grid gap-5">
            <div>
              <h2 className="text-lg font-semibold">{copy.startDiagnosis}</h2>
              <p className="mt-2 text-sm leading-6 text-white/58">{copy.confirmBody}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={copy.projectName} optional optionalLabel={contextConfig.optionalLabel}>
                <Input
                  value={projectName}
                  onChange={(event) => setProjectName(event.target.value)}
                  placeholder={generatedProjectName}
                />
                <p className="text-xs leading-5 text-white/42">
                  {copy.generatedNamePreview}: <span className="text-white/68">{generatedProjectName}</span>
                </p>
              </Field>
              <Field label={contextConfig.comparisonLabel} optional optionalLabel={contextConfig.optionalLabel}>
                <Input
                  value={competitors}
                  onChange={(event) => setCompetitors(event.target.value)}
                  placeholder={contextConfig.comparisonPlaceholder}
                />
                <p className="text-xs leading-5 text-white/42">{contextConfig.comparisonHelp}</p>
              </Field>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/18 p-4">
              <Badge className="border-white/10 bg-white/8 text-white/70" variant="outline">
                {copy.types[entityType]}
              </Badge>
              <div className="mt-3 text-xl font-semibold">{subjectName || copy.subjectName}</div>
              <p className="mt-2 text-sm leading-6 text-white/58">{desiredUnderstanding || targetMarket || industry}</p>
              {domain ? <p className="mt-2 font-mono text-xs text-white/38">{domain}</p> : null}
            </div>
          </section>
        ) : null}
      </div>

      {formError ? <p className="mt-4 text-sm text-rose-200">{formError}</p> : null}

      <div className="mt-6 flex justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          className="border-white/15 bg-white/6 text-white hover:bg-white/12 hover:text-white"
          disabled={step === 0 || isSubmitting}
          onClick={() => setStep((current) => Math.max(0, current - 1))}
        >
          {copy.back}
        </Button>
        {step < 2 ? (
          <Button type="button" disabled={!canContinue} onClick={() => setStep((current) => current + 1)}>
            {copy.next}
            <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button type="button" disabled={!canContinue || isSubmitting} onClick={submit}>
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {isSubmitting ? copy.creating : copy.startDiagnosis}
          </Button>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  optional = false,
  required = false,
  optionalLabel = "Optional",
}: {
  label: string;
  children: React.ReactNode;
  optional?: boolean;
  required?: boolean;
  optionalLabel?: string;
}) {
  return (
    <div className="grid gap-2">
      <Label className="text-white/72">
        {label}
        {optional ? <span className="ml-2 text-xs text-white/38">{optionalLabel}</span> : null}
        {required ? <span className="ml-2 text-xs text-amber-100">*</span> : null}
      </Label>
      {children}
    </div>
  );
}

function getEntityContextConfig(
  locale: WizardLocale,
  entityType: EntityType,
  copy: ReturnType<typeof getDictionary>["projectWizard"],
) {
  const fieldLabels = copy.fieldLabels[entityType];
  const placeholders = copy.placeholders[entityType];
  return {
    subjectLabel: fieldLabels.subjectName,
    websiteLabel: fieldLabels.website,
    categoryLabel: fieldLabels.category,
    audienceLabel: fieldLabels.targetAudience,
    subjectPlaceholder: placeholders.subjectName,
    websitePlaceholder: placeholders.website,
    categoryPlaceholder: placeholders.category,
    audiencePlaceholder: placeholders.targetAudience,
    comparisonLabel: copy.comparisonLabels[entityType],
    comparisonPlaceholder: copy.comparisonPlaceholders[entityType],
    comparisonHelp: copy.comparisonHelp[entityType],
    optionalLabel: copy.optional ?? (locale === "zh-CN" ? "可选" : "Optional"),
  };
}

function generateProjectNamePreview(
  subjectName: string,
  language: string,
  copy: ReturnType<typeof getDictionary>["projectWizard"],
) {
  return buildAuditNamePreview({ subjectName, language, fallbackSubject: copy.subjectName });
}
