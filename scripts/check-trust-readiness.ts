import { isDatabaseConfigured } from "@/server/db";
import { signingConfigured } from "@/server/evidence/manifest";
import { ensureObjectStorageBucket, isObjectStorageConfigured } from "@/server/external/object-storage";

async function main() {
  const checks: Record<string, boolean> = {
    PostgreSQL: isDatabaseConfigured(),
    "Redis worker": Boolean(process.env.REDIS_URL),
    "Private object storage": isObjectStorageConfigured(),
    "Ed25519 report signing": signingConfigured(),
  };

  if (checks["Private object storage"]) {
    try {
      await ensureObjectStorageBucket();
    } catch {
      checks["Private object storage"] = false;
    }
  }

  const missing = Object.entries(checks).filter(([, ready]) => !ready).map(([name]) => name);
  if (missing.length) {
    console.error(`Trust release blocked. Missing: ${missing.join(", ")}.`);
    process.exitCode = 1;
  } else {
    console.log("Trust release infrastructure is configured.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
