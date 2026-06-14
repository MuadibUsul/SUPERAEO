import type { Prisma } from "@/generated/prisma/client";
import { getPrisma, isDatabaseConfigured } from "@/server/db";

export async function writeAuditLog(input: {
  actorUserId?: string;
  organizationId?: string;
  action: string;
  targetType: string;
  targetId?: string;
  metadata?: unknown;
}) {
  if (!isDatabaseConfigured()) {
    return;
  }

  await getPrisma().auditLog.create({
    data: {
      actorUserId: input.actorUserId,
      organizationId: input.organizationId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      metadata:
        input.metadata === undefined
          ? undefined
          : (input.metadata as Prisma.InputJsonValue),
    },
  });
}
