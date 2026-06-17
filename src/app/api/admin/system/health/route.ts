import { NextResponse } from "next/server";

import { requireAdminApiSession } from "@/server/auth/session";
import { isDatabaseConfigured } from "@/server/db";
import { checkCognitiveServiceHealth } from "@/server/external/cognitive-service";
import { checkNeo4jHealth } from "@/server/external/neo4j";
import { checkQdrantHealth } from "@/server/external/qdrant";
import { isObjectStorageConfigured } from "@/server/external/object-storage";
import { withApiTrace } from "@/server/observability/api-wrapper";
import { checkQueueHealth, getQueueDepths } from "@/server/queue/client";
import { getWorkerHealth } from "@/server/queue/worker-health";

const HEALTH_CHECK_TIMEOUT_MS = 5000;

export const GET = withApiTrace({ subsystem: "admin", operation: "admin.system.health" }, async function GET() {
  const auth = await requireAdminApiSession();
  if (!auth.ok) return auth.response;

  const [queue, queueDepths, worker, qdrant, neo4j, cognitive] = await Promise.all([
    withTimeout(checkQueueHealth(), "Redis / Queue"),
    getQueueDepths(),
    getWorkerHealth(),
    withTimeout(checkQdrantHealth(), "Qdrant"),
    withTimeout(checkNeo4jHealth(), "Neo4j"),
    withTimeout(checkCognitiveServiceHealth(), "Cognitive service"),
  ]);

  return NextResponse.json({
    services: {
      database: {
        ok: isDatabaseConfigured(),
        message: isDatabaseConfigured() ? "Database configured." : "DATABASE_URL is missing.",
      },
      queue,
      worker,
      queueDepths,
      qdrant,
      neo4j,
      cognitive,
      objectStorage: {
        ok: isObjectStorageConfigured(),
        message: isObjectStorageConfigured()
          ? "Object storage configured."
          : "S3-compatible object storage is not configured.",
      },
    },
  });
});

async function withTimeout<T extends { ok: boolean; message: string }>(promise: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => {
      setTimeout(
        () =>
          resolve({
            ok: false,
            message: `${label} health check timed out after ${HEALTH_CHECK_TIMEOUT_MS / 1000} seconds.`,
          } as T),
        HEALTH_CHECK_TIMEOUT_MS,
      );
    }),
  ]).catch((error) => ({
    ok: false,
    message: error instanceof Error ? error.message : `${label} health check failed.`,
  })) as Promise<T>;
}
