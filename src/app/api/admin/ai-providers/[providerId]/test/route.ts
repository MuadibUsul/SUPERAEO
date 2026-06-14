import { NextResponse } from "next/server";

import { requireAdminApiSession } from "@/server/auth/session";
import { getProviderRuntime } from "@/server/ai/provider-registry";
import { withApiTrace } from "@/server/observability/api-wrapper";

type ProviderTestContext = {
  params: Promise<{ providerId: string }>;
};

export const POST = withApiTrace<ProviderTestContext>({ subsystem: "admin", operation: "admin.providers.test" }, async function POST(_request: Request, { params }: ProviderTestContext) {
  const auth = await requireAdminApiSession({ write: true });

  if (!auth.ok) {
    return auth.response;
  }

  const { providerId } = await params;

  try {
    const runtime = await getProviderRuntime(providerId);
    const result = await runtime.testConnection();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Provider test failed." },
      { status: 400 },
    );
  }
});
