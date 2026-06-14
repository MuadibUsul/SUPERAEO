import { getPrisma } from "@/server/db";
import type { AuthSession } from "@/server/auth/session";
import { isOperatorRole } from "@/server/auth/roles";

export async function getDefaultOrganizationForUser(userId: string) {
  const prisma = getPrisma();
  const membership = await prisma.organizationMember.findFirst({
    where: { userId },
    include: { organization: true },
    orderBy: { createdAt: "asc" },
  });

  return membership?.organization ?? null;
}

export function projectAccessWhere(session: AuthSession) {
  if (isOperatorRole(session.role)) {
    return {};
  }

  const organizationIds = session.user.memberships.map(
    (membership) => membership.organizationId,
  );

  return {
    organizationId: {
      in: organizationIds,
    },
  };
}

export async function countAccessibleProjectsForUser(input: {
  userId: string;
  role: AuthSession["role"];
  organizationIds?: string[];
}) {
  const prisma = getPrisma();

  if (isOperatorRole(input.role)) {
    return prisma.project.count();
  }

  const organizationIds =
    input.organizationIds && input.organizationIds.length > 0
      ? input.organizationIds
      : (
          await prisma.organizationMember.findMany({
            where: { userId: input.userId },
            select: { organizationId: true },
          })
        ).map((membership) => membership.organizationId);

  if (organizationIds.length === 0) {
    return 0;
  }

  return prisma.project.count({
    where: {
      organizationId: {
        in: organizationIds,
      },
    },
  });
}
