import { NextResponse } from "next/server";

import { requireAdminApiSession } from "@/server/auth/session";
import { sanitizeProvider, validateProviderCompatibility } from "@/server/ai/provider-config";
import { getPrisma } from "@/server/db";
import { withApiTrace } from "@/server/observability/api-wrapper";
import { encryptSecret } from "@/server/security/encryption";
import { updateAIProviderSchema } from "@/server/validation/admin";

type ProviderContext = {
  params: Promise<{ providerId: string }>;
};

export const GET = withApiTrace<ProviderContext>({ subsystem: "admin", operation: "admin.providers.get" }, async function GET(_request: Request, { params }: ProviderContext) {
  const auth = await requireAdminApiSession();

  if (!auth.ok) {
    return auth.response;
  }

  const { providerId } = await params;
  const provider = await getPrisma().aIProvider.findUnique({
    where: { id: providerId },
  });

  if (!provider) {
    return NextResponse.json({ error: "Provider not found." }, { status: 404 });
  }

  return NextResponse.json({ provider: sanitizeProvider(provider) });
});

export const PATCH = withApiTrace<ProviderContext>({ subsystem: "admin", operation: "admin.providers.update" }, async function PATCH(request: Request, { params }: ProviderContext) {
  const auth = await requireAdminApiSession({ write: true });

  if (!auth.ok) {
    return auth.response;
  }

  const { providerId } = await params;
  const current = await getPrisma().aIProvider.findUnique({
    where: { id: providerId },
  });

  if (!current) {
    return NextResponse.json({ error: "Provider not found." }, { status: 404 });
  }

  const json = await request.json().catch(() => null);
  const parsed = updateAIProviderSchema.safeParse(json);

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return NextResponse.json(
      {
        error: firstIssue?.message ?? "Invalid provider payload.",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const input = parsed.data;
  const merged = {
    name: input.name ?? current.name,
    providerType: input.providerType ?? current.providerType,
    baseUrl: input.baseUrl === undefined ? current.baseUrl : input.baseUrl || null,
    defaultModel: input.defaultModel ?? current.defaultModel,
  };

  let normalizedBaseUrl: string | null;
  try {
    normalizedBaseUrl = validateProviderCompatibility(merged).normalizedBaseUrl;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Provider configuration is invalid." },
      { status: 400 },
    );
  }

  const duplicate = await getPrisma().aIProvider.findFirst({
    where: {
      id: { not: providerId },
      name: { equals: merged.name, mode: "insensitive" },
      providerType: merged.providerType,
      baseUrl: normalizedBaseUrl,
      defaultModel: merged.defaultModel,
    },
  });

  if (duplicate) {
    return NextResponse.json(
      { error: "A provider with the same name, type, base URL, and model already exists." },
      { status: 409 },
    );
  }

  let apiKeyEncrypted: string | undefined;

  if (input.apiKey) {
    try {
      apiKeyEncrypted = encryptSecret(input.apiKey);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "API key encryption failed." },
        { status: 400 },
      );
    }
  }

  const provider = await getPrisma().aIProvider.update({
    where: { id: providerId },
    data: {
      name: input.name,
      providerType: input.providerType,
      baseUrl: input.baseUrl === undefined ? undefined : normalizedBaseUrl,
      apiKeyEncrypted,
      defaultModel: input.defaultModel,
      enabled: input.enabled,
      supportsJsonSchema: input.supportsJsonSchema,
      supportsCitations: input.supportsCitations,
      supportsWebSearch: input.supportsWebSearch,
      supportsEmbeddings: input.supportsEmbeddings,
      rateLimitPerMinute: input.rateLimitPerMinute,
      monthlyBudget: input.monthlyBudget,
    },
  });

  return NextResponse.json({ provider: sanitizeProvider(provider) });
});

export const DELETE = withApiTrace<ProviderContext>({ subsystem: "admin", operation: "admin.providers.delete" }, async function DELETE(_request: Request, { params }: ProviderContext) {
  const auth = await requireAdminApiSession({ write: true });

  if (!auth.ok) {
    return auth.response;
  }

  const { providerId } = await params;
  const provider = await getPrisma().aIProvider.findUnique({
    where: { id: providerId },
    include: { _count: { select: { models: true } } },
  });

  if (!provider) {
    return NextResponse.json({ error: "Provider not found." }, { status: 404 });
  }

  await getPrisma().aIProvider.delete({
    where: { id: providerId },
  });

  return NextResponse.json({
    ok: true,
    message:
      provider._count.models > 0
        ? "Provider deleted. Related model records were removed with it."
        : "Provider deleted.",
  });
});
