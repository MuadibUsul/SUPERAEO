/**
 * Quick connectivity check for configured AI providers.
 * Tests the FIRST enabled provider with its own defaultModel plus the canonical
 * DeepSeek model ids, using a ~5-token request. Run: tsx scripts/test-providers.ts
 */
import "dotenv/config";
import { getPrisma } from "../src/server/db";
import { getProviderRuntimeContext } from "../src/server/ai/provider-registry";

async function main() {
  const prisma = getPrisma();
  const providers = await prisma.aIProvider.findMany({ where: { enabled: true }, orderBy: { createdAt: "asc" } });
  if (providers.length === 0) {
    console.log("No enabled providers.");
    return;
  }
  const p = providers[0];
  console.log(`Testing first enabled provider: ${p.name} | type=${p.providerType} | baseUrl=${p.baseUrl} | defaultModel=${p.defaultModel}`);
  const { runtime } = await getProviderRuntimeContext(p.id);

  const models = Array.from(new Set([p.defaultModel, "deepseek-chat"]));
  for (const model of models) {
    // JSON path with a realistic budget — this is what the probe pipeline uses.
    try {
      const r = await runtime.generateJson({
        prompt: 'Return JSON: {"probe_id":"t1","mentioned_brand":true,"keywords":["a","b"]}',
        operation: "provider_diag_json",
        schemaName: "probe_result",
        jsonSchema: {},
        model,
        maxOutputTokens: 300,
        temperature: 0,
      });
      const text = (r.text || "").trim();
      let parseable = false;
      try { JSON.parse(text); parseable = true; } catch {}
      console.log(`  model="${model}" JSON -> ok | parseable=${parseable} | len=${text.length} | usage=${JSON.stringify(r.usage)} | text="${text.slice(0, 60)}"`);
    } catch (error) {
      console.log(`  model="${model}" JSON -> FAIL | ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
