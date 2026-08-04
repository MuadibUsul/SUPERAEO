"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Circle, Loader2, Play, RefreshCw, XCircle } from "lucide-react";

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
  traceId: string;
  status: JobStatus;
  result: unknown;
  error: string | null;
};

type DiagnosisStatus = {
  job: DiagnosisJob | null;
  latestRun: { id: string; status: string; sampleCount: number; failureSummary: string | null } | null;
  latestReport: { id: string; title: string } | null;
  workerAlive: boolean;
};

type AuditStatusCopy = {
  title: string;
  subtitle: string;
  start: string;
  retry: string;
  running: string;
  queued: string;
  delayed: string;
  delayedDescription: string;
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

// A glimpse of what the system is doing in each stage — evocative, rotating
// lines that convey real motion without exposing raw internals.
const stageThoughts: Record<StageKey, { "zh-CN": string[]; en: string[] }> = {
  DIAGNOSIS_UNDERSTANDING_ENTITY: {
    "zh-CN": ["正在读取你的实体画像…", "判断 AI 应该如何理解你…", "锁定品类与目标人群…"],
    en: ["Reading your entity profile…", "Working out how AI should frame you…", "Locking onto category and audience…"],
  },
  DIAGNOSIS_BUILDING_QUESTION_MAP: {
    "zh-CN": ["生成真实用户会问的问题…", "覆盖场景、人群与竞品…", "铺开问题地图…"],
    en: ["Generating the questions real users ask…", "Covering scenarios, audiences, competitors…", "Spreading out the question map…"],
  },
  DIAGNOSIS_SAMPLING_AI_ANSWERS: {
    "zh-CN": ["向模型提问并收集回答…", "观察哪些竞品先被提到…", "跨场景采样中…"],
    en: ["Asking the model and collecting answers…", "Watching which competitors surface first…", "Sampling across scenarios…"],
  },
  DIAGNOSIS_MAPPING_SEMANTIC_FIELD: {
    "zh-CN": ["提取语义词并计算引力…", "把概念排进星云…", "连接共现关系…"],
    en: ["Extracting terms and computing gravity…", "Placing concepts into the nebula…", "Linking co-occurrences…"],
  },
  DIAGNOSIS_FINDING_OPPORTUNITIES: {
    "zh-CN": ["寻找无人占据的高意图问题…", "评估竞品弱点…", "排序长尾机会…"],
    en: ["Finding high-intent questions nobody owns…", "Assessing competitor weakness…", "Ranking long-tail opportunities…"],
  },
  DIAGNOSIS_BUILDING_EVIDENCE_REPORT: {
    "zh-CN": ["把发现整理成结论…", "为每个判断挂上证据…", "撰写认知报告…"],
    en: ["Turning findings into conclusions…", "Attaching evidence to every claim…", "Writing the cognition report…"],
  },
};

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
  const [progress, setProgress] = useState(0);
  const [thoughtTick, setThoughtTick] = useState(0);
  const stageMetaRef = useRef<{ index: number; startedAt: number; status: string }>({ index: 0, startedAt: 0, status: "" });
  const jobIdRef = useRef<string | null>(null);

  const localeKey: "zh-CN" | "en" = locale === "en" ? "en" : "zh-CN";

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

  // Track which stage is current and when it started, so progress can ease
  // within a stage and snap forward on real transitions. Reset on a new run.
  useEffect(() => {
    const job = status?.job;
    const result = asRecord(job?.result);
    const currentStage = typeof result.currentStage === "string" ? result.currentStage : null;
    const index = currentStage ? Math.max(0, stageOrder.indexOf(currentStage as StageKey)) : 0;
    const history = Array.isArray(result.stageHistory) ? result.stageHistory : [];
    const lastEntry = [...history].reverse().find((item) => asRecord(item).stage === currentStage);
    const at = lastEntry ? Date.parse(String(asRecord(lastEntry).at)) : Date.now();
    stageMetaRef.current = { index, startedAt: Number.isFinite(at) ? at : Date.now(), status: job?.status ?? "" };

    if (job?.id && job.id !== jobIdRef.current && (job.status === "queued" || job.status === "running")) {
      jobIdRef.current = job.id;
      setProgress(0);
    }
  }, [status]);

  // Drive the progress bar + rotating "thinking" caption.
  useEffect(() => {
    const id = window.setInterval(() => {
      const { index, startedAt, status: jobStatus } = stageMetaRef.current;
      let target: number;
      if (jobStatus === "completed") target = 100;
      else if (jobStatus === "failed") target = -1;
      else if (!jobStatus) target = 0;
      else {
        const band = 100 / stageOrder.length;
        const base = index * band;
        const elapsed = (Date.now() - startedAt) / 1000;
        const ease = 1 - Math.exp(-elapsed / 7);
        target = jobStatus === "queued" ? 4 : base + band * 0.92 * ease;
      }
      setProgress((prev) => (target < 0 || target <= prev ? prev : prev + (target - prev) * 0.12));
      setThoughtTick(Math.floor(Date.now() / 2200));
    }, 140);
    return () => window.clearInterval(id);
  }, []);

  const workerDelayed = status?.job?.status === "queued" && status.workerAlive === false;
  const stageState = useMemo(() => buildStageState(status?.job), [status?.job]);
  const statusLabel = workerDelayed ? copy.delayed : getStatusLabel(status?.job?.status, copy);
  const isFailed = status?.job?.status === "failed";
  const isCompleted = status?.job?.status === "completed";
  const canStart = !active && !isStarting;

  const result = asRecord(status?.job?.result);
  const currentStage = (typeof result.currentStage === "string" ? result.currentStage : null) as StageKey | null;
  const currentThoughts = currentStage ? stageThoughts[currentStage]?.[localeKey] : null;
  const samplingCount =
    currentStage === "DIAGNOSIS_SAMPLING_AI_ANSWERS" && status?.latestRun?.sampleCount ? status.latestRun.sampleCount : 0;
  const thought =
    currentThoughts && currentThoughts.length
      ? `${currentThoughts[thoughtTick % currentThoughts.length]}${samplingCount ? ` · ${samplingCount}` : ""}`
      : copy.subtitle;
  const stageLabel = workerDelayed ? copy.delayed : currentStage ? copy.stages[currentStage] : active ? copy.queued : copy.running;
  const showProgress = (active && !workerDelayed) || isCompleted;

  async function startDiagnosis() {
    setError(null);
    setIsStarting(true);
    setProgress(0);
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
      <section className="rounded-lg border border-success/20 bg-success/5 p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs uppercase tracking-[0.22em] text-success">{copy.title}</p>
              <span className="rounded-full border border-success/25 bg-success/10 px-2.5 py-1 text-xs text-success">
                {statusLabel}
              </span>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{copy.compactHint}</p>
            {status?.latestRun ? (
              <p className="mt-2 text-xs text-faint">
                {copy.latestRun}: {status.latestRun.status} / {status.latestRun.sampleCount}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {status?.latestReport ? (
              <Button asChild variant="outline">
                <Link href={`/${locale}/app/projects/${projectId}/reports`}>{copy.viewReport}</Link>
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={() => setExpanded(true)}>
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
    <section className="panel p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="eyebrow text-muted-foreground">{copy.title}</p>
            <span
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs",
                isCompleted
                  ? "border-success/25 bg-success/10 text-success"
                  : workerDelayed
                    ? "border-warning/30 bg-warning/10 text-warning"
                  : isFailed
                    ? "border-danger/25 bg-danger/10 text-danger"
                    : "border-border bg-muted text-muted-foreground",
              )}
            >
              {statusLabel}
            </span>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{copy.subtitle}</p>
          {status?.latestRun ? (
            <p className="mt-2 text-xs text-faint">
              {copy.latestRun}: {status.latestRun.status} / {status.latestRun.sampleCount}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {isCompleted ? (
            <Button type="button" variant="outline" onClick={() => setExpanded(false)}>
              <ChevronUp className="h-4 w-4" />
              {copy.collapse}
            </Button>
          ) : null}
          {status?.latestReport ? (
            <Button asChild variant="outline">
              <Link href={`/${locale}/app/projects/${projectId}/reports`}>{copy.viewReport}</Link>
            </Button>
          ) : null}
          <Button type="button" disabled={!canStart} onClick={startDiagnosis}>
            <span className="inline-flex size-4 items-center justify-center">
              {isStarting || (active && !workerDelayed) ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : workerDelayed ? (
                <AlertTriangle className="h-4 w-4" />
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

      {workerDelayed ? (
        <div className="mt-4 rounded-md border border-warning/25 bg-warning/10 p-3">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{copy.delayed}</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{copy.delayedDescription}</p>
              <p className="mt-2 break-all font-mono text-xs text-faint">Trace: {status?.job?.traceId ?? "-"}</p>
            </div>
          </div>
        </div>
      ) : null}

      {showProgress ? (
        <div className="mt-4">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2 text-foreground">
              {active ? (
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                </span>
              ) : (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
              )}
              <span className="truncate font-medium">{stageLabel}</span>
            </span>
            <span className="shrink-0 font-mono text-xs text-faint">{Math.round(progress)}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-200 ease-out"
              style={{ width: `${Math.max(2, Math.round(progress))}%` }}
            />
          </div>
          {active ? (
            <p key={thought} className="mt-2 animate-fade-in text-xs text-muted-foreground">
              {thought}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 grid gap-2 md:grid-cols-3 xl:grid-cols-6">
        {stageOrder.map((stage) => {
          const state = stageState.get(stage) ?? "pending";
          return (
            <div
              key={stage}
              className={cn(
                "rounded-md border px-3 py-3",
                state === "done"
                  ? "border-success/20 bg-success/5"
                  : state === "current"
                    ? "border-primary/25 bg-primary/5"
                    : "border-border bg-muted/50",
              )}
            >
              <div className="flex items-center gap-2">
                {state === "done" ? (
                  <CheckCircle2 className="h-4 w-4 text-success" />
                ) : state === "current" ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                ) : isFailed ? (
                  <XCircle className="h-4 w-4 text-muted-foreground/50" />
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground/50" />
                )}
                <span className="text-sm text-dim">{copy.stages[stage]}</span>
              </div>
            </div>
          );
        })}
      </div>

      {status?.job?.error || error ? <p className="mt-3 text-sm text-danger">{error ?? status?.job?.error}</p> : null}
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
