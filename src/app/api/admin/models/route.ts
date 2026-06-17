import { NextResponse } from "next/server";

import { requireAdminApiSession } from "@/server/auth/session";
import { getPrisma } from "@/server/db";
import { withApiTrace } from "@/server/observability/api-wrapper";
import { createAIModelSchema } from "@/server/validation/admin";

export const GET = withApiTrace({ subsystem: "admin", operation: "admin.models.list" }, async function GET() {
  const auth = await requireAdminApiSession();

  if (!auth.ok) {
    return auth.response;
  }

  const models = await getPrisma().aIModel.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      provider: {
        select: { id: true, name: true, providerType: true, enabled: true },
      },
    },
  });

  return NextResponse.json({ models });
});

export const POST = withApiTrace({ subsystem: "admin", operation: "admin.models.create" }, async function POST(request: Request) {
  const auth = await requireAdminApiSession({ write: true });

  if (!auth.ok) {
    return auth.response;
  }

  const json = await request.json().catch(() => null);
  const parsed = createAIModelSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid model payload.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const input = parsed.data;
  const model = await getPrisma().aIModel.create({
    data: {
      providerId: input.providerId,
      name: input.name,
      displayName: input.displayName || null,
      enabled: input.enabled,
      supportsJsonSchema: input.supportsJsonSchema,
      supportsCitations: input.supportsCitations,
      supportsWebSearch: input.supportsWebSearch,
      supportsEmbeddings: input.supportsEmbeddings,
      defaultForTasks: input.defaultForTasks,
    },
  });

  return NextResponse.json({ model }, { status: 201 });
});
