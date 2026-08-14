import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { NextResponse } from "next/server";

import { normalizeLocale } from "@/i18n/config";
import { requireApiSession } from "@/server/auth/session";
import { auditQuotaMessage, reserveDiagnosisAudit } from "@/server/billing/usage-service";
import { getProject } from "@/server/data/projects";
import { getPrisma, isDatabaseConfigured } from "@/server/db";
import { runFullDiagnosis } from "@/server/diagnosis/diagnosis-service";
import { normalizeError } from "@/server/observability/errors";
import { withJobTrace } from "@/server/observability/job-wrapper";
import { withApiTrace } from "@/server/observability/api-wrapper";
import { enqueueReservedAnalysisJob, getQueue, getQueueNames, isKnownQueueName, isRedisConfigured } from "@/server/queue/client";
import { getWorkerHealth, isWorkerVersionCompatible, WORKER_PROTOCOL_VERSION } from "@/server/queue/worker-health";

type Context = {
  params: Promise<{ projectId: string }>;
};

export const POST = withApiTrace<Context>({ subsystem: "diagnosis", operation: "diagnosis.start" }, async function POST(_request: Request, { params }: Context) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database is not configured." }, { status: 503 });
  }

  const { projectId } = await params;
  const project = await getProject(projectId, auth.session);
  if (project.status !== "ready" || !project.data) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  // In production a long-running diagnosis must run on a durable queue. Falling
  // back to an in-process background task there risks losing the job on deploy
  // or instance recycle, so require Redis (or an explicit opt-in) instead of
  // silently degrading. Local development keeps the in-process path.
  if (!isRedisConfigured() && process.env.NODE_ENV === "production" && process.env.ALLOW_LOCAL_DIAGNOSIS !== "true") {
    return NextResponse.json(
      { error: "Background processing is not available. Configure REDIS_URL to run diagnosis." },
      { status: 503 },
    );
  }

  const redisConfigured = isRedisConfigured();
  const workerHealth = redisConfigured ? await getWorkerHealth() : null;
  const workerCompatible = !redisConfigured || isWorkerVersionCompatible(workerHealth);
  if (redisConfigured && !workerCompatible && process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: `Background worker is unavailable or outdated. Expected worker protocol ${WORKER_PROTOCOL_VERSION}.` },
      { status: 503 },
    );
  }
  const shouldRunInline = !redisConfigured || (!workerCompatible && process.env.NODE_ENV !== "production");
  if (!project.data.organizationId) {
    return NextResponse.json({ error: "Project is not assigned to an organization." }, { status: 409 });
  }

  const traceId = randomUUID();
  const payload = {
    projectId,
    requestedByUserId: auth.session.user.id,
    traceId,
  } satisfies Prisma.InputJsonObject;
  const reservation = await reserveDiagnosisAudit({
    organizationId: project.data.organizationId,
    projectId,
    queueName: getQueueNames().semanticIntelligence,
    traceId,
    payload,
  });

  if (reservation.status === "organization_missing") {
    return NextResponse.json({ error: "Organization not found." }, { status: 409 });
  }

  if (reservation.status === "denied") {
    const locale = normalizeLocale(auth.session.user.preferredLocale ?? "en");
    return NextResponse.json(
      {
        error: auditQuotaMessage(reservation, locale),
        code: "AUDIT_QUOTA_REACHED",
        limit: reservation.limit,
        used: reservation.used,
      },
      { status: 402 },
    );
  }

  if (reservation.status === "existing") {
    const activeJob = reservation.job;
    const activeJobInlineFallback = shouldRunInline && activeJob.status === "queued";
    if (activeJobInlineFallback) {
      await removeQueuedRedisJob(activeJob);
      void runLocalDiagnosisJob({
        analysisJobId: activeJob.id,
        projectId,
        requestedByUserId: auth.session.user.id,
        traceId: activeJob.traceId,
      });
    }

    return NextResponse.json(
      {
        job: activeJob,
        queued: activeJob.status !== "completed",
        workerAlive: workerCompatible,
        executionMode: activeJobInlineFallback
          ? "local_background"
          : redisConfigured && !workerCompatible
            ? "queued_no_worker"
            : "redis_queue",
      },
      { status: 202 },
    );
  }

  const job = await enqueueReservedAnalysisJob({
    analysisJob: reservation.job,
    enqueueToRedis: !shouldRunInline,
  });

  if (shouldRunInline) {
    void runLocalDiagnosisJob({
      analysisJobId: job.analysisJob.id,
      projectId,
      requestedByUserId: auth.session.user.id,
      traceId,
    });
  }

  return NextResponse.json(
    {
      job: job.analysisJob,
      queued: true,
      redisQueued: job.redisQueued,
      workerAlive: workerCompatible,
      executionMode: shouldRunInline
        ? "local_background"
        : redisConfigured && !workerCompatible
          ? "queued_no_worker"
          : "redis_queue",
    },
    { status: 202 },
  );
});

async function removeQueuedRedisJob(job: { queueName: string; queueJobId: string | null }) {
  if (!job.queueJobId || !isKnownQueueName(job.queueName)) return false;

  try {
    const bullJob = await getQueue(job.queueName).getJob(job.queueJobId);
    if (!bullJob) return false;

    const state = await bullJob.getState();
    if (state === "waiting" || state === "delayed" || state === "prioritized" || state === "waiting-children") {
      await bullJob.remove();
      return true;
    }
  } catch (error) {
    console.error("Failed to remove queued Redis diagnosis job before local fallback", error);
  }

  return false;
}

function mergeResult(current: unknown, patch: Record<string, unknown>) {
  return {
    ...(current && typeof current === "object" && !Array.isArray(current) ? current : {}),
    ...patch,
  };
}

async function runLocalDiagnosisJob(input: {
  analysisJobId: string;
  projectId: string;
  requestedByUserId: string;
  traceId: string;
}) {
  const prisma = getPrisma();
  await prisma.analysisJob.update({
    where: { id: input.analysisJobId },
    data: { status: "running", startedAt: new Date(), attempts: { increment: 1 } },
  });

  try {
    const result = await withJobTrace(
      {
        traceId: input.traceId,
        subsystem: "local_worker",
        operation: "full_diagnosis",
        projectId: input.projectId,
        analysisJobId: input.analysisJobId,
        metadata: { executionMode: "local_background" },
      },
      () =>
        runFullDiagnosis({
          projectId: input.projectId,
          requestedByUserId: input.requestedByUserId,
          analysisJobId: input.analysisJobId,
        }),
    );
    const latestJob = await prisma.analysisJob.findUnique({ where: { id: input.analysisJobId } });
    await prisma.analysisJob.update({
      where: { id: input.analysisJobId },
      data: {
        status: "completed",
        completedAt: new Date(),
        result: mergeResult(latestJob?.result, { output: result }) as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    const normalized = normalizeError(error, {
      errorCode: "FULL_DIAGNOSIS_FAILED",
      message: "审计生成失败，请重试或联系管理员。",
      status: 500,
    });
    await prisma.analysisJob.update({
      where: { id: input.analysisJobId },
      data: {
        status: "failed",
        completedAt: new Date(),
        error: `${normalized.safeMessage} Trace ID: ${input.traceId}`,
      },
    });
  }
}
