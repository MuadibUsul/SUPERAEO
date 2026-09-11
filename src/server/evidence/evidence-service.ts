import type { EvidenceGrade, EvidenceLinkRelation, EvidenceSupportStatus, Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/server/db";
import { isRecord } from "@/server/utils/coerce";
import {
  DEFAULT_SHARE_DAYS,
  EVIDENCE_METHOD_VERSION,
  createShareToken,
  hashShareToken,
  publicReportProjection,
  publicSigningKey,
  signManifest,
  verifyManifest,
} from "@/server/evidence/manifest";

export function evidenceGrade(sampleCount: number, modelCounts: number[] = []): EvidenceGrade {
  if (sampleCount < 20) return "INSUFFICIENT";
  if (modelCounts.length <= 1 || modelCounts.some((count) => count < 20)) return "DIRECTIONAL";
  return "CORROBORATED";
}

export function supportStatus(supporting: number, opposing: number, total: number): EvidenceSupportStatus {
  if (total < 20) return "INSUFFICIENT";
  if (supporting > 0 && opposing > 0) return "MIXED";
  return supporting > 0 ? "SUPPORTED" : "UNSUPPORTED";
}

export async function createReportEvidence(reportId: string) {
  const prisma = getPrisma();
  const report = await prisma.report.findUnique({ where: { id: reportId }, include: { run: true } });
  if (!report?.runId) return [];
  const responses = await prisma.aIResponse.findMany({
    where: { runId: report.runId },
    include: {
      analysis: true,
      citationSources: { include: { snapshots: { orderBy: { createdAt: "desc" }, take: 1 } } },
      probeResults: { where: { probeFamily: "answer_extraction" }, orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  const modelCounts = [...responses.reduce((map, item) => map.set(item.model, (map.get(item.model) ?? 0) + 1), new Map<string, number>()).values()];
  const definitions = [
    { key: "mention", statement: "The subject was mentioned in sampled model answers.", supports: (r: typeof responses[number]) => normalizedBoolean(r, "targetMentioned") ?? Boolean(r.analysis?.brandMentioned) },
    { key: "recommendation", statement: "The subject was recommended in sampled model answers.", supports: (r: typeof responses[number]) => normalizedBoolean(r, "targetRecommended") ?? Boolean(r.analysis?.brandRecommended) },
    { key: "citation", statement: "The subject was supported by citations in sampled model answers.", supports: (r: typeof responses[number]) => normalizedBoolean(r, "targetCited") ?? r.citationSources.some((source) => source.supportsBrand) },
  ];
  await prisma.evidenceClaim.deleteMany({ where: { reportId, claimType: "INFERENCE" } });
  const result = [];
  for (const definition of definitions) {
    const supporting = responses.filter(definition.supports);
    const opposing = responses.filter((response) => !definition.supports(response));
    const claim = await prisma.evidenceClaim.create({
      data: {
        projectId: report.projectId,
        reportId,
        runId: report.runId,
        claimType: "INFERENCE",
        supportStatus: supportStatus(supporting.length, opposing.length, responses.length),
        evidenceGrade: evidenceGrade(responses.length, modelCounts),
        statement: definition.statement,
        methodVersion: EVIDENCE_METHOD_VERSION,
        supportingCount: supporting.length,
        opposingCount: opposing.length,
        metadata: { metric: definition.key, machineAssessment: true },
        links: {
          create: responses.map((response) => {
            const citation = definition.key === "citation" ? response.citationSources.find((source) => source.supportsBrand) : undefined;
            return {
              responseId: response.id,
              citationSourceId: citation?.id,
              sourceSnapshotId: citation?.snapshots[0]?.id,
              relation: (definition.supports(response) ? "SUPPORTS" : "OPPOSES") as EvidenceLinkRelation,
              excerpt: (response.normalizedAnswer ?? response.rawResponse).slice(0, 1000),
            };
          }),
        },
      },
    });
    result.push(claim);
  }
  const priorSnapshot = report.snapshot && typeof report.snapshot === "object" && !Array.isArray(report.snapshot) ? report.snapshot as Record<string, unknown> : {};
  await prisma.report.update({ where: { id: reportId }, data: { snapshot: { ...priorSnapshot, evidenceManifest: { methodVersion: EVIDENCE_METHOD_VERSION, claimIds: result.map((claim) => claim.id), legacyIncomplete: false } } as Prisma.InputJsonValue } });
  return result;
}

function normalizedBoolean(response: { probeResults: Array<{ normalizedJson: unknown }> }, key: string) {
  const normalized = response.probeResults[0]?.normalizedJson;
  return isRecord(normalized) && typeof normalized[key] === "boolean" ? normalized[key] : null;
}

export async function ensureEvidenceManifest(reportId: string) {
  const prisma = getPrisma();
  const existing = await prisma.evidenceManifest.findUnique({ where: { reportId } });
  if (existing) return existing;
  const report = await prisma.report.findUnique({ where: { id: reportId }, include: { evidenceClaims: true } });
  if (!report?.snapshot) throw new Error("Report snapshot is unavailable.");
  const projection = {
    ...publicReportProjection(report.snapshot),
    report: { id: report.id, title: report.title, createdAt: report.createdAt.toISOString() },
    claims: report.evidenceClaims.map((claim) => ({
      id: claim.id,
      type: claim.claimType,
      statement: claim.statement,
      supportStatus: claim.supportStatus,
      evidenceGrade: claim.evidenceGrade,
      supportingCount: claim.supportingCount,
      opposingCount: claim.opposingCount,
      methodVersion: claim.methodVersion,
      machineAssessed: claim.machineAssessed,
    })),
    legacyIncomplete: !String((report.snapshot as Record<string, unknown>).version ?? "").startsWith("2026-09-09"),
  };
  const signed = signManifest(projection);
  return prisma.evidenceManifest.create({ data: { projectId: report.projectId, reportId, canonicalJson: projection as Prisma.InputJsonValue, contentHash: signed.contentHash, signature: signed.signature, keyId: signed.keyId, methodVersion: EVIDENCE_METHOD_VERSION } });
}

export async function createReportShare(input: { reportId: string; days?: number }) {
  const prisma = getPrisma();
  const report = await prisma.report.findUnique({ where: { id: input.reportId } });
  if (!report) throw new Error("Report not found.");
  const manifest = await ensureEvidenceManifest(report.id);
  const token = createShareToken();
  const days = Math.max(1, Math.min(DEFAULT_SHARE_DAYS, Math.floor(input.days ?? DEFAULT_SHARE_DAYS)));
  const share = await prisma.reportShare.create({ data: { projectId: report.projectId, reportId: report.id, manifestId: manifest.id, tokenHash: hashShareToken(token), expiresAt: new Date(Date.now() + days * 86_400_000) } });
  return { share, token };
}

export async function getPublicVerification(token: string) {
  const prisma = getPrisma();
  const share = await prisma.reportShare.findUnique({ where: { tokenHash: hashShareToken(token) }, include: { manifest: true, report: { select: { title: true } }, project: { select: { organizationId: true } } } });
  if (!share) return null;
  const expired = share.expiresAt.getTime() <= Date.now();
  const revoked = Boolean(share.revokedAt);
  const publicKey = publicSigningKey(share.manifest.keyId);
  const signatureValid = Boolean(publicKey && verifyManifest(share.manifest.canonicalJson, share.manifest.signature, publicKey));
  if (signatureValid && !expired && !revoked) await prisma.reportShare.update({ where: { id: share.id }, data: { accessCount: { increment: 1 }, lastAccessedAt: new Date() } }).catch(() => null);
  const verificationStatus = !signatureValid ? "invalid_signature" : revoked ? "revoked" : expired ? "expired" : "valid";
  await prisma.auditLog.create({ data: { organizationId: share.project.organizationId, action: "report_share.accessed", targetType: "ReportShare", targetId: share.id, metadata: { status: verificationStatus } } }).catch(() => null);
  return {
    status: verificationStatus,
    reportTitle: share.report.title,
    issuedAt: share.createdAt.toISOString(),
    expiresAt: share.expiresAt.toISOString(),
    manifest: signatureValid && !expired && !revoked ? share.manifest.canonicalJson : null,
    signatureValid,
    contentHash: share.manifest.contentHash,
    signature: share.manifest.signature,
    keyId: share.manifest.keyId,
    methodVersion: share.manifest.methodVersion,
  };
}
