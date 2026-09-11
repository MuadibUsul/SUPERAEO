import { getPrisma } from "@/server/db";
import { deleteStoredObject } from "@/server/external/object-storage";

const DAY = 86_400_000;
function days(name: string, fallback: number) { const value = Number(process.env[name]); return Number.isFinite(value) && value > 0 ? value : fallback; }

/** Deletes raw evidence while retaining signed report manifests and their
 * public verification records. Safe to run repeatedly from a daily scheduler. */
export async function cleanupRetention(now = new Date()) {
  const prisma = getPrisma();
  const rawCutoff = new Date(now.getTime() - days("EVIDENCE_RAW_RETENTION_DAYS", 180) * DAY);
  const auditCutoff = new Date(now.getTime() - days("AUDIT_LOG_RETENTION_DAYS", 365) * DAY);
  const deletedProjectCutoff = new Date(now.getTime() - days("DELETED_PROJECT_PURGE_DAYS", 30) * DAY);
  const artifacts = await prisma.objectArtifact.findMany({ where: { OR: [{ createdAt: { lt: rawCutoff }, artifactType: { in: ["ai_response", "crawl_snapshot"] } }, { project: { deletedAt: { lt: deletedProjectCutoff } } }] }, select: { id: true, bucket: true, objectKey: true } });
  let deletedObjects = 0;
  for (const artifact of artifacts) {
    try { if (await deleteStoredObject(artifact.bucket, artifact.objectKey)) deletedObjects += 1; }
    catch (error) { console.error("Retention object deletion failed", { artifactId: artifact.id, error }); continue; }
    await prisma.objectArtifact.delete({ where: { id: artifact.id } });
  }
  const [responses, sourceSnapshots, runs, auditLogs] = await prisma.$transaction([
    prisma.aIResponse.deleteMany({ where: { createdAt: { lt: rawCutoff } } }),
    prisma.sourceSnapshot.deleteMany({ where: { OR: [{ createdAt: { lt: rawCutoff } }, { project: { deletedAt: { lt: deletedProjectCutoff } } }] } }),
    prisma.samplingRun.deleteMany({ where: { project: { deletedAt: { lt: deletedProjectCutoff } } } }),
    prisma.auditLog.deleteMany({ where: { createdAt: { lt: auditCutoff } } }),
  ]);
  return { deletedObjects, responses: responses.count, sourceSnapshots: sourceSnapshots.count, runs: runs.count, auditLogs: auditLogs.count };
}
