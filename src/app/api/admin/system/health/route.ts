import { NextResponse } from "next/server";

import { requireAdminApiSession } from "@/server/auth/session";
import { isDatabaseConfigured } from "@/server/db";
import { checkCognitiveServiceHealth } from "@/server/external/cognitive-service";
import { checkNeo4jHealth } from "@/server/external/neo4j";
import { checkQdrantHealth } from "@/server/external/qdrant";
import { isObjectStorageConfigured } from "@/server/external/object-storage";
import { checkQueueHealth } from "@/server/queue/client";

export async function GET() {
  const auth = await requireAdminApiSession();
  if (!auth.ok) return auth.response;

  const [queue, qdrant, neo4j, cognitive] = await Promise.all([
    checkQueueHealth(),
    checkQdrantHealth(),
    checkNeo4jHealth(),
    checkCognitiveServiceHealth(),
  ]);

  return NextResponse.json({
    services: {
      database: {
        ok: isDatabaseConfigured(),
        message: isDatabaseConfigured() ? "Database configured." : "DATABASE_URL is missing.",
      },
      queue,
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
}

