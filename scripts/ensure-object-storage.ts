import { ensureObjectStorageBucket } from "@/server/external/object-storage";

async function main() {
  await ensureObjectStorageBucket();
  console.log("Private evidence bucket is ready.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
