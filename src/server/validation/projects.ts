import { z } from "zod";

import { comparisonCategoryFor, getAuditTypeSpec, type RequiredInput } from "@/server/audit-types/spec";

const entityTypeSchema = z.enum(["BRAND", "PERSON", "WEBSITE", "PRODUCT"]);

export const comparisonInputSchema = z.object({
  name: z.string().trim().min(1, "Comparison name is required."),
  domain: z.string().trim().optional().default(""),
  category: z.string().trim().optional().default("direct"),
});

export const competitorInputSchema = comparisonInputSchema;

const rawProjectSchema = z.object({
  entityType: entityTypeSchema.optional(),
  name: z.string().trim().optional(),
  subjectName: z.string().trim().optional(),
  websiteUrl: z.string().trim().optional(),
  category: z.string().trim().optional(),
  market: z.string().trim().optional(),
  desiredUnderstanding: z.string().trim().optional(),
  language: z.string().trim().min(2).max(8).optional(),
  comparisons: z.array(comparisonInputSchema).optional(),

  // Legacy project fields. They remain accepted for old clients and DB compatibility,
  // but they are normalized into the entity-first shape above.
  brandName: z.string().trim().optional(),
  domain: z.string().trim().optional(),
  industry: z.string().trim().optional(),
  targetMarket: z.string().trim().optional(),
  competitors: z.array(competitorInputSchema).optional(),
});

export const createProjectSchema = rawProjectSchema
  .superRefine((input, context) => {
    // Required inputs differ by audit type: a website audit is meaningless
    // without a URL, and a person audit cannot disambiguate same-name people
    // without a field. This was previously enforced only in the client form.
    const spec = getAuditTypeSpec(input.entityType ?? "BRAND");
    const zh = (firstText(input.language) ?? "en").toLowerCase().startsWith("zh");
    const values: Record<RequiredInput["field"], string | undefined> = {
      subjectName: firstText(input.subjectName, input.brandName),
      category: firstText(input.category, input.industry),
      market: firstText(input.market, input.targetMarket),
      websiteUrl: firstText(input.websiteUrl, input.domain),
      desiredUnderstanding: firstText(input.desiredUnderstanding),
    };

    for (const required of spec.requiredInputs) {
      const value = values[required.field];
      if (value && (!required.validate || required.validate(value))) continue;

      context.addIssue({
        code: "custom",
        path: [required.field],
        message: zh ? required.message.zh : required.message.en,
      });
    }
  })
  .transform(normalizeCreateProjectInput);

export const updateProjectSchema = rawProjectSchema.transform(normalizeUpdateProjectInput);

export const createCompetitorSchema = competitorInputSchema;

export type CreateProjectInput = z.output<typeof createProjectSchema>;
export type CreateProjectFormInput = z.input<typeof createProjectSchema>;
export type UpdateProjectInput = z.output<typeof updateProjectSchema>;
export type CreateCompetitorInput = z.infer<typeof createCompetitorSchema>;

function normalizeCreateProjectInput(input: z.infer<typeof rawProjectSchema>) {
  const entityType = input.entityType ?? "BRAND";
  const subjectName = firstText(input.subjectName, input.brandName) ?? "";
  const websiteUrl = firstText(input.websiteUrl, input.domain) ?? "";
  const category = firstText(input.category, input.industry) ?? "";
  const market = firstText(input.market, input.targetMarket) ?? "";
  const comparisons = withComparisonCategory(entityType, input.comparisons ?? input.competitors ?? []);

  return {
    entityType,
    name: firstText(input.name) ?? "",
    subjectName,
    websiteUrl,
    category,
    market,
    desiredUnderstanding: firstText(input.desiredUnderstanding) ?? "",
    language: firstText(input.language) ?? "en",
    comparisons,

    // Compatibility aliases for the existing Project table and old view code.
    brandName: subjectName,
    domain: websiteUrl,
    industry: category,
    targetMarket: market,
    competitors: comparisons,
  };
}

function normalizeUpdateProjectInput(input: z.infer<typeof rawProjectSchema>) {
  const subjectName = firstText(input.subjectName, input.brandName);
  const websiteUrl = firstText(input.websiteUrl, input.domain);
  const category = firstText(input.category, input.industry);
  const market = firstText(input.market, input.targetMarket);
  // Only stampable when the caller told us the type; a partial update that
  // omits entityType leaves the stored categories alone.
  const rawComparisons = input.comparisons ?? input.competitors;
  const comparisons = rawComparisons && input.entityType
    ? withComparisonCategory(input.entityType, rawComparisons)
    : rawComparisons;

  return {
    ...(input.entityType ? { entityType: input.entityType } : {}),
    ...(input.name !== undefined ? { name: firstText(input.name) ?? "" } : {}),
    ...(subjectName !== undefined ? { subjectName, brandName: subjectName } : {}),
    ...(websiteUrl !== undefined ? { websiteUrl, domain: websiteUrl } : {}),
    ...(category !== undefined ? { category, industry: category } : {}),
    ...(market !== undefined ? { market, targetMarket: market } : {}),
    ...(input.desiredUnderstanding !== undefined
      ? { desiredUnderstanding: firstText(input.desiredUnderstanding) ?? "" }
      : {}),
    ...(input.language !== undefined ? { language: firstText(input.language) ?? "en" } : {}),
    ...(comparisons !== undefined ? { comparisons, competitors: comparisons } : {}),
  };
}

/**
 * A comparison target means something different per audit type — a competitor,
 * a peer expert, an alternative source, a substitute product. Stamping the
 * type's category server-side stops every type from being flattened into
 * "direct" competitor when the client omits it.
 */
function withComparisonCategory(
  entityType: z.infer<typeof entityTypeSchema>,
  comparisons: Array<z.infer<typeof comparisonInputSchema>>,
) {
  const defaultCategory = comparisonCategoryFor(entityType);
  return comparisons.map((comparison) => ({
    ...comparison,
    category: comparison.category && comparison.category !== "direct" ? comparison.category : defaultCategory,
  }));
}

function firstText(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}
