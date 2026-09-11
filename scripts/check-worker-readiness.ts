import { getWorkerHealth, isWorkerVersionCompatible } from "@/server/queue/worker-health";

async function main() {
  const health = await getWorkerHealth();
  if (!isWorkerVersionCompatible(health)) {
    console.error(`Worker readiness blocked: ${health.message}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Worker is ready: ${health.workerId}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
