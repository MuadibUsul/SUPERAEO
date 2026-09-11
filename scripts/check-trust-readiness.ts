import { isDatabaseConfigured } from "@/server/db";
import { signingConfigured } from "@/server/evidence/manifest";
import { isObjectStorageConfigured } from "@/server/external/object-storage";

const checks = {
  PostgreSQL: isDatabaseConfigured(),
  "Redis worker": Boolean(process.env.REDIS_URL),
  "Private object storage": isObjectStorageConfigured(),
  "Ed25519 report signing": signingConfigured(),
};

const missing = Object.entries(checks).filter(([, ready]) => !ready).map(([name]) => name);
if (missing.length) {
  console.error(`Trust release blocked. Missing: ${missing.join(", ")}.`);
  process.exitCode = 1;
} else {
  console.log("Trust release infrastructure is configured.");
}
