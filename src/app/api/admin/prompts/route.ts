import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";

import { requireAdminApiSession } from "@/server/auth/session";
import { getPrisma } from "@/server/db";
import { withApiTrace } from "@/server/observability/api-wrapper";
import { createPromptTemplateSchema } from "@/server/validation/admin";

export const GET = withApiTrace({ subsystem: "admin", operation: "admin.prompts.list" }, async function GET() {
  const auth = await requireAdminApiSession();

  if (!auth.ok) {
    return auth.response;
  }

  const prompts = await getPrisma().promptTemplate.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      createdBy: {
        select: { id: true, email: true, name: true },
      },
    },
  });

  return NextResponse.json({ prompts });
});

export const POST = withApiTrace({ subsystem: "admin", operation: "admin.prompts.create" }, async function POST(request: Request) {
  const auth = await requireAdminApiSession({ write: true });

  if (!auth.ok) {
    return auth.response;
  }

  const json = await request.json().catch(() => null);
  const parsed = createPromptTemplateSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid prompt template payload.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const input = parsed.data;
  const prompt = await getPrisma().promptTemplate.create({
    data: {
      name: input.name,
      task: input.task,
      version: input.version,
      locale: input.locale,
      content: input.content,
      outputSchema:
        input.outputSchema === undefined
          ? undefined
          : (input.outputSchema as Prisma.InputJsonValue),
      status: input.status,
      createdById: auth.session.user.id,
    },
  });

  return NextResponse.json({ prompt }, { status: 201 });
});
