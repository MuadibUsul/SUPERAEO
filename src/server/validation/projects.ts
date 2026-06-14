import { z } from "zod";

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
    const subjectName = firstText(input.subjectName, input.brandName);
    const category = firstText(input.category, input.industry);
    const market = firstText(input.market, input.targetMarket);

    if (!subjectName) {
      context.addIssue({
        code: "custom",
        path: ["subjectName"],
        message: "Subject name is required.",
      });
    }

    if (!category) {
      context.addIssue({
        code: "custom",
        path: ["category"],
        message: "Category is required.",
      });
    }

    if (!market) {
      context.addIssue({
        code: "custom",
        path: ["market"],
        message: "Market is required.",
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
  const subjectName = firstText(input.subjectName, input.brandName) ?? "";
  const websiteUrl = firstText(input.websiteUrl, input.domain) ?? "";
  const category = firstText(input.category, input.industry) ?? "";
  const market = firstText(input.market, input.targetMarket) ?? "";
  const comparisons = input.comparisons ?? input.competitors ?? [];

  return {
    entityType: input.entityType ?? "BRAND",
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
  const comparisons = input.comparisons ?? input.competitors;

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

function firstText(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}
