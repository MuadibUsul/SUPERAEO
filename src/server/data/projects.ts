import {
  databaseErrorState,
  databaseNotConfiguredState,
  getPrisma,
  isDatabaseConfigured,
  type DataState,
} from "@/server/db";
import type { AuthSession } from "@/server/auth/session";
import { projectAccessWhere } from "@/server/auth/organizations";

export type ProjectListItem = {
  id: string;
  name: string;
  brandName: string;
  domain: string;
  industry: string;
  targetMarket: string;
  language: string;
  createdAt: Date;
  subjects: {
    id: string;
    entityType: "BRAND" | "PERSON" | "WEBSITE" | "PRODUCT";
    displayName: string;
    canonicalName: string;
    websiteUrl: string | null;
    market: string | null;
    language: string;
    isPrimary: boolean;
  }[];
  organization?: {
    id: string;
    name: string;
  } | null;
  _count: {
    competitors: number;
    keywords: number;
    queries: number;
    runs: number;
    actionItems: number;
  };
};

export type ProjectWithCompetitors = {
  id: string;
  name: string;
  brandName: string;
  domain: string;
  industry: string;
  targetMarket: string;
  language: string;
  createdAt: Date;
  updatedAt: Date;
  organizationId: string | null;
  subjects: {
    id: string;
    entityType: "BRAND" | "PERSON" | "WEBSITE" | "PRODUCT";
    displayName: string;
    canonicalName: string;
    websiteUrl: string | null;
    market: string | null;
    language: string;
    profileJson: unknown;
    isPrimary: boolean;
    createdAt: Date;
    updatedAt: Date;
  }[];
  competitors: {
    id: string;
    name: string;
    domain: string | null;
    category: string;
    createdAt: Date;
  }[];
  _count: {
    competitors: number;
    keywords: number;
    queries: number;
    runs: number;
    actionItems: number;
  };
};

export async function listProjects(
  session?: AuthSession,
): Promise<DataState<ProjectListItem[]>> {
  if (!isDatabaseConfigured()) {
    return databaseNotConfiguredState();
  }

  try {
    const prisma = getPrisma();
    const projects = await prisma.project.findMany({
      where: session ? projectAccessWhere(session) : {},
      orderBy: { createdAt: "desc" },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
          },
        },
        subjects: {
          orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
          select: {
            id: true,
            entityType: true,
            displayName: true,
            canonicalName: true,
            websiteUrl: true,
            market: true,
            language: true,
            isPrimary: true,
          },
        },
        _count: {
          select: {
            competitors: true,
            keywords: true,
            queries: true,
            runs: true,
            actionItems: true,
          },
        },
      },
    });

    return { status: "ready", data: projects };
  } catch (error) {
    return databaseErrorState(error);
  }
}

/**
 * `session` is required, not optional: it is the only thing scoping the lookup
 * to organizations the caller belongs to. As an optional parameter a forgotten
 * argument silently returned any project by id.
 */
export async function getProject(
  projectId: string,
  session: AuthSession,
): Promise<DataState<ProjectWithCompetitors | null>> {
  if (!isDatabaseConfigured()) {
    return databaseNotConfiguredState();
  }

  try {
    const prisma = getPrisma();
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        ...projectAccessWhere(session),
      },
      include: {
        competitors: {
          orderBy: { createdAt: "asc" },
        },
        subjects: {
          orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        },
        _count: {
          select: {
            competitors: true,
            keywords: true,
            queries: true,
            runs: true,
            actionItems: true,
          },
        },
      },
    });

    return { status: "ready", data: project };
  } catch (error) {
    return databaseErrorState(error);
  }
}
