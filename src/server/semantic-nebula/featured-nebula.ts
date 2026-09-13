import { unstable_cache } from "next/cache";

import { getPrisma, isDatabaseConfigured } from "@/server/db";

export type FeaturedNebula = {
  projectId: string;
  subjectName: string;
  nodeJson: unknown;
};

/**
 * The semantic field the marketing hero shows. HOME_FEATURED_PROJECT_ID pins a
 * specific project; without it the newest OVERALL snapshot wins, so a fresh
 * deployment still fronts real data instead of the demo field.
 *
 * Cached because the node payload is large and the field only changes when an
 * audit materializes a new snapshot.
 */
export const getFeaturedNebula = unstable_cache(
  async (): Promise<FeaturedNebula | null> => {
    if (!isDatabaseConfigured()) return null;

    try {
      const projectId = process.env.HOME_FEATURED_PROJECT_ID?.trim();
      const snapshot = await getPrisma().semanticNebulaSnapshot.findFirst({
        where: { scope: "OVERALL", ...(projectId ? { projectId } : {}) },
        orderBy: { createdAt: "desc" },
        select: {
          projectId: true,
          nodeJson: true,
          subject: { select: { displayName: true } },
          project: { select: { brandName: true } },
        },
      });
      if (!snapshot) return null;

      const subjectName = snapshot.subject.displayName.trim() || snapshot.project.brandName;
      const nodes = Array.isArray(snapshot.nodeJson) ? snapshot.nodeJson : [];
      if (!subjectName || nodes.length === 0) return null;

      return { projectId: snapshot.projectId, subjectName, nodeJson: snapshot.nodeJson };
    } catch {
      // The hero is decoration: a missing or unreachable database must degrade to
      // the demo field, never fail the landing page.
      return null;
    }
  },
  ["home-featured-nebula"],
  { revalidate: 300 },
);
