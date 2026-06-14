import type { Prisma, ProjectSubject, SubjectEntityType } from "@/generated/prisma/client";

import { getPrisma } from "@/server/db";

export type LegacyBrandProject = {
  id: string;
  brandName: string;
  domain: string;
  industry: string;
  targetMarket: string;
  language: string;
};

export type SubjectComparison = {
  name: string;
  domain: string | null;
  category: string;
};

export type SubjectContext = {
  subjectId: string;
  projectId: string;
  entityType: SubjectEntityType;
  subjectName: string;
  canonicalName: string;
  websiteUrl: string;
  category: string;
  market: string;
  language: string;
  desiredUnderstanding: string;
  aliases: string[];
  comparisons: SubjectComparison[];
  legacy: {
    brandName: string;
    domain: string;
    industry: string;
    targetMarket: string;
  };
};

export type SubjectCreateInput = {
  entityType: SubjectEntityType | "BRAND" | "PERSON" | "WEBSITE" | "PRODUCT";
  subjectName: string;
  websiteUrl?: string | null;
  category: string;
  market: string;
  desiredUnderstanding?: string | null;
  language: string;
  source?: string;
  aliases?: string[];
  comparisons?: SubjectComparison[];
};

export function canonicalizeSubjectName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function buildLegacyBrandSubjectProfile(
  project: Pick<LegacyBrandProject, "brandName" | "domain" | "industry" | "targetMarket">,
) {
  return {
    source: "legacy_project_compatibility",
    brandName: project.brandName,
    domain: project.domain,
    industry: project.industry,
    targetMarket: project.targetMarket,
    subjectName: project.brandName,
    websiteUrl: project.domain,
    category: project.industry,
    market: project.targetMarket,
    desiredUnderstanding: "",
    aliases: [],
    comparisons: [],
  } satisfies Prisma.InputJsonObject;
}

export function buildProjectSubjectCreateInput(input: SubjectCreateInput) {
  const websiteUrl = input.websiteUrl?.trim() || "";
  const profile = {
    source: input.source ?? "project_creation_wizard",
    entityType: input.entityType,
    subjectName: input.subjectName,
    websiteUrl,
    category: input.category,
    market: input.market,
    desiredUnderstanding: input.desiredUnderstanding ?? "",
    aliases: input.aliases ?? [],
    comparisons: input.comparisons ?? [],

    // Legacy aliases for older report and metric readers.
    brandName: input.subjectName,
    domain: websiteUrl,
    industry: input.category,
    targetMarket: input.market,
  } satisfies Prisma.InputJsonObject;

  return {
    entityType: input.entityType as SubjectEntityType,
    displayName: input.subjectName,
    canonicalName: canonicalizeSubjectName(input.subjectName),
    websiteUrl: websiteUrl || null,
    market: input.market,
    language: input.language || "en",
    profileJson: profile,
    isPrimary: true,
  };
}

export function buildLegacyBrandSubjectCreateInput(project: Omit<LegacyBrandProject, "id">) {
  return buildProjectSubjectCreateInput({
    entityType: "BRAND",
    subjectName: project.brandName,
    websiteUrl: project.domain,
    category: project.industry,
    market: project.targetMarket,
    desiredUnderstanding: "",
    language: project.language || "en",
    source: "legacy_project_compatibility",
  });
}

export function buildSubjectContext(
  project: LegacyBrandProject,
  subject: ProjectSubject,
  comparisons: SubjectComparison[] = [],
): SubjectContext {
  const profile = asJsonObject(subject.profileJson);
  const aliases = arrayOfStrings(profile.aliases);
  const profileComparisons = arrayOfComparisons(profile.comparisons);
  const category = textFrom(profile.category, profile.industry) ?? project.industry;
  const websiteUrl = subject.websiteUrl ?? textFrom(profile.websiteUrl, profile.domain) ?? project.domain;
  const market = subject.market ?? textFrom(profile.market, profile.targetMarket) ?? project.targetMarket;

  return {
    subjectId: subject.id,
    projectId: subject.projectId,
    entityType: subject.entityType,
    subjectName: subject.displayName,
    canonicalName: subject.canonicalName,
    websiteUrl,
    category,
    market,
    language: subject.language || project.language || "en",
    desiredUnderstanding: textFrom(profile.desiredUnderstanding) ?? "",
    aliases,
    comparisons: comparisons.length > 0 ? comparisons : profileComparisons,
    legacy: {
      brandName: project.brandName,
      domain: project.domain,
      industry: project.industry,
      targetMarket: project.targetMarket,
    },
  };
}

export async function ensurePrimaryProjectSubject(project: LegacyBrandProject) {
  const prisma = getPrisma();
  const existing = await prisma.projectSubject.findFirst({
    where: {
      projectId: project.id,
      isPrimary: true,
    },
    orderBy: { createdAt: "asc" },
  });

  if (existing) {
    return existing;
  }

  return prisma.projectSubject.create({
    data: {
      projectId: project.id,
      ...buildLegacyBrandSubjectCreateInput(project),
    },
  });
}

export async function syncPrimaryBrandSubject(
  project: LegacyBrandProject,
  input: Partial<SubjectCreateInput> = {},
) {
  const prisma = getPrisma();
  const existing = await prisma.projectSubject.findFirst({
    where: {
      projectId: project.id,
      isPrimary: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const data = buildProjectSubjectCreateInput({
    entityType: input.entityType ?? existing?.entityType ?? "BRAND",
    subjectName: input.subjectName ?? project.brandName,
    websiteUrl: input.websiteUrl ?? project.domain,
    category: input.category ?? project.industry,
    market: input.market ?? project.targetMarket,
    desiredUnderstanding: input.desiredUnderstanding ?? textFrom(asJsonObject(existing?.profileJson).desiredUnderstanding) ?? "",
    language: input.language ?? existing?.language ?? project.language,
    source: "project_update",
    aliases: input.aliases ?? arrayOfStrings(asJsonObject(existing?.profileJson).aliases),
    comparisons: input.comparisons ?? arrayOfComparisons(asJsonObject(existing?.profileJson).comparisons),
  });

  if (existing) {
    return prisma.projectSubject.update({
      where: { id: existing.id },
      data,
    });
  }

  return prisma.projectSubject.create({
    data: {
      projectId: project.id,
      ...data,
    },
  });
}

function asJsonObject(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function textFrom(...values: unknown[]) {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

function arrayOfStrings(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function arrayOfComparisons(value: unknown): SubjectComparison[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const record = item as Record<string, unknown>;
      const name = textFrom(record.name);
      if (!name) return null;
      return {
        name,
        domain: textFrom(record.domain) ?? null,
        category: textFrom(record.category) ?? "direct",
      };
    })
    .filter((item): item is SubjectComparison => Boolean(item));
}
