"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ChevronDown, ChevronUp, Circle, Loader2, Play, RefreshCw, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type StageKey =
  | "DIAGNOSIS_UNDERSTANDING_ENTITY"
  | "DIAGNOSIS_BUILDING_QUESTION_MAP"
  | "DIAGNOSIS_SAMPLING_AI_ANSWERS"
  | "DIAGNOSIS_MAPPING_SEMANTIC_FIELD"
  | "DIAGNOSIS_FINDING_OPPORTUNITIES"
  | "DIAGNOSIS_BUILDING_EVIDENCE_REPORT";

type JobStatus = "queued" | "running" | "completed" | "failed" | "retrying";

type DiagnosisJob = {
  id: string;
  status: JobStatus;
  result: unknown;
  error: string | null;
};

type DiagnosisStatus = {
  job: DiagnosisJob | null;
  latestRun: { id: string; status: string; sampleCount: number; failureSummary: string | null } | null;
  latestReport: { id: string; title: string } | null;
};

type AuditStatusCopy = {
  title: string;
  subtitle: string;
  start: string;
  retry: string;
  running: string;
  queued: string;
  completed: string;
  failed: string;
  noJob: string;
  viewReport: string;
  latestRun: string;
  collapse: string;
  expand: string;
  compactHint: string;
  stages: Record<StageKey, string>;
};

const stageOrder: StageKey[] = [
  "DIAGNOSIS_UNDERSTANDING_ENTITY",
  "DIAGNOSIS_BUILDING_QUESTION_MAP",
  "DIAGNOSIS_SAMPLING_AI_ANSWERS",
  "DIAGNOSIS_MAPPING_SEMANTIC_FIELD",
  "DIAGNOSIS_FINDING_OPPORTUNITIES",
  "DIAGNOSIS_BUILDING_EVIDENCE_REPORT",
];

export function AuditStatusPanel({
  projectId,
  locale,
  copy,
  variant = "expanded",
}: {
  projectId: string;
  locale: string;
  copy: AuditStatusCopy;
  variant?: "expanded" | "compact";
}) {
  const [status, setStatus] = useState<DiagnosisStatus | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);

  const active =
    status?.job?.status === "queued" ||
    status?.job?.status === "running" ||
    status?.job?.status === "retrying";

  const loadStatus = useCallback(async () => {
    const response = await fetch(`/api/projects/${projectId}/diagnosis/status`, { cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (response.ok) {
      setStatus(payload);
      setExpanded(payload?.job?.status === "completed" ? variant !== "compact" : true);
    }
  }, [projectId, variant]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadStatus(), 0);
    return () => window.clearTimeout(timer);
  }, [loadStatus]);

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => void loadStatus(), 2500);
    return () => window.clearInterval(timer);
  }, [active, loadStatus]);

  const stageState = useMemo(() => buildStageState(status?.job), [status?.job]);
  const statusLabel = getStatusLabel(status?.job?.status, copy);
  const isFailed = status?.job?.status === "failed";
  const isCompleted = status?.job?.status === "completed";
  const canStart = !active && !isStarting;

  async function startDiagnosis() {
    setError(null);
    setIsStarting(true);
    const response = await fetch(`/api/projects/${projectId}/diagnosis/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const payload = await response.json().catch(() => null);
    setIsStarting(false);
    if (!response.ok) {
      setError(payload?.error ?? "Diagnosis could not be started.");
      return;
    }
    setStatus((current) => ({ ...current, ...payload, job: payload.job ?? current?.job ?? null }));
    setExpanded(true);
    void loadStatus();
  }

  if (isCompleted && !expanded) {
    return (
      <section className="rounded-lg border border-emerald-200/12 bg-emerald-200/[0.06] p-4 text-white shadow-[0_24px_90px_rgba(0,0,0,0.18)] backdrop-blur">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs uppercase tracking-[0.22em] text-emerald-100/80">{copy.title}</p>
              <span className="rounded-full border border-emerald-200/20 bg-emerald-200/10 px-2.5 py-1 text-xs text-emerald-50">
                {statusLabel}
              </span>
            </div>
            <p className="mt-2 text-sm leading-6 text-white/58">{copy.compactHint}</p>
            {status?.latestRun ? (
              <p className="mt-2 text-xs text-white/40">
                {copy.latestRun}: {status.latestRun.status} / {status.latestRun.sampleCount}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {status?.latestReport ? (
              <Button
                asChild
                variant="outline"
                className="border-white/15 bg-white/6 text-white hover:bg-white/12 hover:text-white"
              >
                <Link href={`/${locale}/app/projects/${projectId}/reports`}>{copy.viewReport}</Link>
              </Button>
            ) : null}
            <Button type="button" variant="outline" className="border-white/15 bg-white/6 text-white hover:bg-white/12 hover:text-white" onClick={() => setExpanded(true)}>
              <ChevronDown className="h-4 w-4" />
              {copy.expand}
            </Button>
            <Button type="button" disabled={!canStart} onClick={startDiagnosis}>
              {isStarting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {copy.retry}
            </Button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.045] p-4 text-white shadow-[0_24px_90px_rgba(0,0,0,0.22)] backdrop-blur">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs uppercase tracking-[0.22em] text-amber-200/70">{copy.title}</p>
            <span
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs",
                isCompleted
                  ? "border-emerald-200/20 bg-emerald-200/10 text-emerald-100"
                  : isFailed
                    ? "border-rose-200/20 bg-rose-200/10 text-rose-100"
                    : "border-white/10 bg-white/6 text-white/58",
              )}
            >
              {statusLabel}
            </span>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/56">{copy.subtitle}</p>
          {status?.latestRun ? (
            <p className="mt-2 text-xs text-white/42">
              {copy.latestRun}: {status.latestRun.status} / {status.latestRun.sampleCount}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {isCompleted ? (
            <Button
              type="button"
              variant="outline"
              className="border-white/15 bg-white/6 text-white hover:bg-white/12 hover:text-white"
              onClick={() => setExpanded(false)}
            >
              <ChevronUp className="h-4 w-4" />
              {copy.collapse}
            </Button>
          ) : null}
          {status?.latestReport ? (
            <Button
              asChild
              variant="outline"
              className="border-white/15 bg-white/6 text-white hover:bg-white/12 hover:text-white"
            >
              <Link href={`/${locale}/app/projects/${projectId}/reports`}>{copy.viewReport}</Link>
            </Button>
          ) : null}
          <Button type="button" disabled={!canStart} onClick={startDiagnosis}>
            <span className="inline-flex size-4 items-center justify-center">
              {isStarting || active ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isFailed || isCompleted ? (
                <RefreshCw className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4" />
              )}
            </span>
            <span>{isFailed || isCompleted ? copy.retry : copy.start}</span>
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-3 xl:grid-cols-6">
        {stageOrder.map((stage) => {
          const state = stageState.get(stage) ?? "pending";
          return (
            <div
              key={stage}
              className={cn(
                "rounded-md border px-3 py-3",
                state === "done"
                  ? "border-emerald-200/18 bg-emerald-200/8"
                  : state === "current"
                    ? "border-amber-200/30 bg-amber-200/10"
                    : "border-white/10 bg-black/12",
              )}
            >
              <div className="flex items-center gap-2">
                {state === "done" ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-200" />
                ) : state === "current" ? (
                  <Loader2 className="h-4 w-4 animate-spin text-amber-100" />
                ) : isFailed ? (
                  <XCircle className="h-4 w-4 text-white/28" />
                ) : (
                  <Circle className="h-4 w-4 text-white/28" />
                )}
                <span className="text-sm text-white/78">{copy.stages[stage]}</span>
              </div>
            </div>
          );
        })}
      </div>

      {status?.job?.error || error ? <p className="mt-3 text-sm text-rose-200">{error ?? status?.job?.error}</p> : null}
    </section>
  );
}

function buildStageState(job: DiagnosisJob | null | undefined) {
  const result = asRecord(job?.result);
  const history = Array.isArray(result.stageHistory) ? result.stageHistory : [];
  const seen = new Set(
    history
      .map((item) => asRecord(item).stage)
      .filter((stage): stage is StageKey => typeof stage === "string" && stageOrder.includes(stage as StageKey)),
  );
  const currentStage = typeof result.currentStage === "string" ? result.currentStage : null;
  const output = new Map<StageKey, "pending" | "current" | "done">();

  for (const stage of stageOrder) {
    if (job?.status === "completed" || seen.has(stage)) output.set(stage, "done");
    if (stage === currentStage && job?.status !== "completed") output.set(stage, "current");
  }

  return output;
}

function getStatusLabel(status: JobStatus | undefined, copy: AuditStatusCopy) {
  if (!status) return copy.noJob;
  if (status === "completed") return copy.completed;
  if (status === "failed") return copy.failed;
  if (status === "queued") return copy.queued;
  return copy.running;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
