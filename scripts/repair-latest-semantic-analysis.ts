import "dotenv/config";

import { analyzeResponse } from "@/server/analysis/response-analyzer";
import { getPrisma } from "@/server/db";
import { buildCipMetricBundle, metricSnapshotDataFromBundle } from "@/server/metrics/cip-metrics";
import { buildSemanticNebulaSnapshots } from "@/server/semantic-nebula/nebula-service";

async function main() {
  const args = process.argv.slice(2);
  const projectIds = args.filter((value) => !value.startsWith("--"));
  const missingOnly = args.includes("--missing-only");
  const prisma = getPrisma();
  const projects = await prisma.project.findMany({
    where: projectIds.length ? { id: { in: projectIds } } : undefined,
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });

  let failed = 0;

  for (const project of projects) {
    const run = await prisma.samplingRun.findFirst({
      where: { projectId: project.id, responses: { some: {} } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        subjectId: true,
        responses: { select: { id: true, analysis: { select: { id: true } } }, orderBy: { createdAt: "asc" } },
      },
    });
    if (!run) continue;
    const responses = missingOnly ? run.responses.filter((response) => response.analysis === null) : run.responses;

    console.log(`[${project.name}] reanalyzing ${responses.length} responses from latest run ${run.id}`);
    let completed = 0;
    for (const response of responses) {
      try {
        await analyzeResponse(response.id);
        completed += 1;
        console.log(`[${project.name}] ${completed}/${responses.length}`);
      } catch (error) {
        failed += 1;
        console.error(`[${project.name}] response ${response.id} failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    console.log(`[${project.name}] rebuilding metric and semantic snapshots from analyzed responses`);
    const metricBundle = await buildCipMetricBundle(project.id, run.subjectId);
    await prisma.metricSnapshot.create({
      data: metricSnapshotDataFromBundle({
        projectId: project.id,
        subjectId: run.subjectId,
        runId: run.id,
        bundle: metricBundle,
        source: "repairLatestSemanticAnalysis",
      }),
    });
    await buildSemanticNebulaSnapshots({
      projectId: project.id,
      subjectId: run.subjectId ?? undefined,
      runId: run.id,
    });
  }

  await prisma.$disconnect();
  if (failed > 0) {
    console.error(`Repair finished with ${failed} failed response analyses.`);
    process.exitCode = 1;
  } else {
    console.log("Repair completed successfully.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
