import { AIProviderManager } from "@/components/admin/ai-provider-manager";
import { Badge } from "@/components/ui/badge";
import { sanitizeProvider } from "@/server/ai/provider-config";
import { getPrisma } from "@/server/db";

export const dynamic = "force-dynamic";

export default async function AdminAIProvidersPage() {
  const providers = (
    await getPrisma().aIProvider.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { models: true, usageLogs: true } } },
    })
  ).map((provider) => ({ ...sanitizeProvider(provider), _count: provider._count }));

  return (
    <div className="space-y-6">
      <div>
        <Badge variant="secondary">AI API</Badge>
        <h1 className="mt-3 text-2xl font-semibold tracking-normal">AI Providers</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Configure OpenAI Responses, OpenAI-compatible gateways, Anthropic, Gemini native, and Perplexity-style providers.
        </p>
      </div>
      <AIProviderManager providers={providers} />
    </div>
  );
}
