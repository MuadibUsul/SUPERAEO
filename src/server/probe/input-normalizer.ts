import type { ProjectSubject } from "@/generated/prisma/client";

import type { NormalizedProbeSubject } from "@/server/probe/types";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function normalizeProbeSubject(subject: ProjectSubject): NormalizedProbeSubject {
  return {
    id: subject.id,
    projectId: subject.projectId,
    entityType: subject.entityType,
    displayName: subject.displayName,
    canonicalName: subject.canonicalName,
    websiteUrl: subject.websiteUrl,
    market: subject.market,
    language: subject.language,
    profile: asRecord(subject.profileJson),
  };
}
