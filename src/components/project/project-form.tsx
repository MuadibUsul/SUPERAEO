"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Building2, Globe2, Loader2, PackageCheck, UserRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { buildAuditNamePreview, detectAuditLanguage, getComparisonCategory, parseComparisonNames } from "@/components/project/project-form-helpers";
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
  // Audit language follows what the user types (auto-detected) until they
  // explicitly override it.
  const [languageOverride, setLanguageOverride] = useState<string | null>(null);
  const [competitors, setCompetitors] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const detectedLanguage = useMemo(
    () => detectAuditLanguage([subjectName, industry, targetMarket, desiredUnderstanding].join(" "), safeLocale),
    [subjectName, industry, targetMarket, desiredUnderstanding, safeLocale],
  );
  const language = languageOverride ?? detectedLanguage;

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

    const comparisonInputs = parseComparisonNames(competitors).map((name) => ({
      name,
      domain: "",
      category: comparisonCategory,
    }));

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
        comparisons: comparisonInputs,

        // Legacy aliases accepted by older API consumers.
        brandName: subjectName.trim(),
        domain: domain.trim(),
        industry: industry.trim(),
        targetMarket: targetMarket.trim() || desiredUnderstanding.trim() || industry.trim(),
        desiredUnderstanding: desiredUnderstanding.trim(),
        language,
        competitors: comparisonInputs,
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
    <div className="panel p-4 md:p-6">
      <div className="grid gap-2 sm:grid-cols-3">
        {copy.steps.map((label, index) => (
          <div
            key={label}
            className={cn(
              "rounded-md border px-3 py-2 text-sm",
              index === step
                ? "border-primary/40 bg-primary/10 text-primary"
                : index < step
                  ? "border-success/30 bg-success/10 text-success"
                  : "border-border bg-muted text-faint",
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
            <p className="mt-2 text-sm leading-6 text-dim">{copy.entityHelp}</p>
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
                        ? "border-primary/40 bg-primary/10 shadow-sm"
                        : "border-border bg-card hover:border-border-strong hover:bg-muted",
                    )}
                    onClick={() => setEntityType(item.key)}
                  >
                    <Icon className={cn("h-5 w-5", active ? "text-primary" : "text-muted-foreground")} />
                    <div className="mt-4 font-medium">{copy.types[item.key]}</div>
                    <p className="mt-2 text-sm leading-6 text-dim">{copy.typeDescriptions[item.key]}</p>
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
              <p className="mt-2 text-sm leading-6 text-dim">{copy.contextGuides[entityType]}</p>
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
                <div className="flex items-center gap-2">
                  <Input
                    value={language}
                    onChange={(event) => setLanguageOverride(event.target.value)}
                    placeholder="en"
                  />
                  {languageOverride === null ? (
                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[oklch(0.82_0.13_205/25%)] bg-[oklch(0.82_0.13_205/10%)] px-2.5 py-1.5 text-xs text-[oklch(0.82_0.13_205)]">
                      <span className="size-1.5 rounded-full bg-[oklch(0.82_0.13_205)]" />
                      {safeLocale === "zh-CN" ? "自动检测" : "Auto"}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setLanguageOverride(null)}
                      className="shrink-0 rounded-full border border-border bg-secondary px-2.5 py-1.5 text-xs text-dim transition-colors hover:text-foreground"
                    >
                      {safeLocale === "zh-CN" ? "恢复自动" : "Reset to auto"}
                    </button>
                  )}
                </div>
                <p className="mt-1.5 text-xs text-faint">
                  {safeLocale === "zh-CN" ? "根据你填写的内容自动检测，可手动修改。" : "Detected from what you type — edit to override."}
                </p>
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
              <p className="mt-2 text-sm leading-6 text-dim">{copy.confirmBody}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={copy.projectName} optional optionalLabel={contextConfig.optionalLabel}>
                <Input
                  value={projectName}
                  onChange={(event) => setProjectName(event.target.value)}
                  placeholder={generatedProjectName}
                />
                <p className="text-xs leading-5 text-faint">
                  {copy.generatedNamePreview}: <span className="text-dim">{generatedProjectName}</span>
                </p>
              </Field>
              <Field label={contextConfig.comparisonLabel} optional optionalLabel={contextConfig.optionalLabel}>
                <Input
                  value={competitors}
                  onChange={(event) => setCompetitors(event.target.value)}
                  placeholder={contextConfig.comparisonPlaceholder}
                />
                <p className="text-xs leading-5 text-faint">{contextConfig.comparisonHelp}</p>
              </Field>
            </div>
            <div className="rounded-lg border border-border bg-muted p-4">
              <Badge className="text-dim" variant="outline">
                {copy.types[entityType]}
              </Badge>
              <div className="mt-3 text-xl font-semibold">{subjectName || copy.subjectName}</div>
              <p className="mt-2 text-sm leading-6 text-dim">{desiredUnderstanding || targetMarket || industry}</p>
              {domain ? <p className="mt-2 font-mono text-xs text-faint">{domain}</p> : null}
            </div>
          </section>
        ) : null}
      </div>

      {formError ? <p className="mt-4 text-sm text-danger">{formError}</p> : null}

      <div className="mt-6 flex justify-between gap-3">
        <Button
          type="button"
          variant="outline"
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
      <Label className="text-foreground">
        {label}
        {optional ? <span className="ml-2 text-xs text-faint">{optionalLabel}</span> : null}
        {required ? <span className="ml-2 text-xs text-danger">*</span> : null}
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
