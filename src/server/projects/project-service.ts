import type { AuthSession } from "@/server/auth/session";
import type { SubjectComparison } from "@/server/projects/subject-service";
import type { CreateProjectInput } from "@/server/validation/projects";

import { getDefaultOrganizationForUser } from "@/server/auth/organizations";
import { getPrisma } from "@/server/db";
import { buildProjectSubjectCreateInput } from "@/server/projects/subject-service";
import { normalizeDomain } from "@/server/utils/domain";

function uniqueCompetitorInputs(input: CreateProjectInput["competitors"]): SubjectComparison[] {
  return Array.from(
    new Map(
      input
        .filter((competitor) => competitor.name.trim().length > 0)
        .map((competitor) => [
          competitor.name.trim().toLowerCase(),
          {
            name: competitor.name.trim(),
            domain: competitor.domain ? normalizeDomain(competitor.domain) : null,
            category: competitor.category || "direct",
          },
        ]),
    ).values(),
  );
}

export function generateDefaultProjectName(
  input: Pick<CreateProjectInput, "brandName" | "language" | "name"> & { subjectName?: string },
) {
  const explicitName = input.name.trim();
  if (explicitName) return explicitName;

  const subjectName = (input.subjectName ?? input.brandName).trim();
  return input.language.toLowerCase().startsWith("zh")
    ? `${subjectName} AI 认知审计`
    : `${subjectName} AI Cognition Audit`;
}

export async function createProjectForSession(input: CreateProjectInput, session: AuthSession) {
  const organization = await getDefaultOrganizationForUser(session.user.id);

  if (!organization) {
    return {
      ok: false as const,
      status: 403,
      error: "Current user is not assigned to an organization.",
    };
  }

  const normalizedDomain = normalizeDomain(input.websiteUrl);
  const language = input.language || "en";
  const projectName = generateDefaultProjectName(input);
  const comparisons = uniqueCompetitorInputs(input.competitors);
  const prisma = getPrisma();

  const project = await prisma.project.create({
    data: {
      userId: session.user.id,
      organizationId: organization.id,
      name: projectName,

      // Compatibility fields for older pages. The source of truth is ProjectSubject.
      brandName: input.subjectName,
      domain: normalizedDomain,
      industry: input.category,
      targetMarket: input.market,
      language,
      competitors: {
        create: comparisons,
      },
      subjects: {
        create: buildProjectSubjectCreateInput({
          entityType: input.entityType,
          subjectName: input.subjectName,
          websiteUrl: normalizedDomain,
          category: input.category,
          market: input.market,
          desiredUnderstanding: input.desiredUnderstanding,
          language,
          comparisons,
        }),
      },
    },
    include: {
      competitors: true,
      subjects: true,
    },
  });

  return { ok: true as const, project };
}
