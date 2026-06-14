import { NextResponse } from "next/server";

import { requireAdminApiSession } from "@/server/auth/session";
import { sanitizeProvider, validateProviderCompatibility } from "@/server/ai/provider-config";
import { getPrisma } from "@/server/db";
import { withApiTrace } from "@/server/observability/api-wrapper";
import { encryptSecret } from "@/server/security/encryption";
import { createAIProviderSchema } from "@/server/validation/admin";

export const GET = withApiTrace({ subsystem: "admin", operation: "admin.providers.list" }, async function GET() {
  const auth = await requireAdminApiSession();

  if (!auth.ok) {
    return auth.response;
  }

  const providers = await getPrisma().aIProvider.findMany({
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ providers: providers.map(sanitizeProvider) });
});

export const POST = withApiTrace({ subsystem: "admin", operation: "admin.providers.create" }, async function POST(request: Request) {
  const auth = await requireAdminApiSession({ write: true });

  if (!auth.ok) {
    return auth.response;
  }

  const json = await request.json().catch(() => null);
  const parsed = createAIProviderSchema.safeParse(json);

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

  let normalizedBaseUrl: string | null;
  try {
    normalizedBaseUrl = validateProviderCompatibility({
      providerType: input.providerType,
      baseUrl: input.baseUrl || null,
    }).normalizedBaseUrl;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Provider configuration is invalid." },
      { status: 400 },
    );
  }

  const duplicate = await getPrisma().aIProvider.findFirst({
    where: {
      name: { equals: input.name, mode: "insensitive" },
      providerType: input.providerType,
      baseUrl: normalizedBaseUrl,
      defaultModel: input.defaultModel,
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

  const provider = await getPrisma().aIProvider.create({
    data: {
      name: input.name,
      providerType: input.providerType,
      baseUrl: normalizedBaseUrl,
      apiKeyEncrypted,
      defaultModel: input.defaultModel,
      enabled: input.enabled,
      supportsJsonSchema: input.supportsJsonSchema,
      supportsCitations: input.supportsCitations,
      supportsWebSearch: input.supportsWebSearch,
      supportsEmbeddings: input.supportsEmbeddings,
      rateLimitPerMinute: input.rateLimitPerMinute ?? null,
      monthlyBudget: input.monthlyBudget ?? null,
      createdById: auth.session.user.id,
    },
  });

  return NextResponse.json({ provider: sanitizeProvider(provider) }, { status: 201 });
});
