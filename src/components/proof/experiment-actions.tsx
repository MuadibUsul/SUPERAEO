"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Calculator, FlaskConical, Play, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type QueryOption = {
  id: string;
  queryText: string;
  queryType: string;
};

type Arm = "treatment" | "control" | "exclude";

const metricOptions = [
  { value: "factualAccuracy", label: "Factual accuracy" },
  { value: "featureAccuracy", label: "Feature accuracy" },
  { value: "citationRate", label: "Citation rate" },
  { value: "recommendationShare", label: "Recommendation share" },
  { value: "authority", label: "Authority" },
  { value: "mentionRate", label: "Mention rate" },
];

function copyFor(locale: string) {
  const zh = locale === "zh-CN";
  return {
    title: zh ? "新建自助实验" : "New self-serve experiment",
    name: zh ? "实验名称" : "Experiment name",
    hypothesis: zh ? "假设" : "Hypothesis",
    metric: zh ? "指标" : "Metric",
    grouping: zh ? "分组" : "Grouping",
    auto: zh ? "自动平衡" : "Auto-balanced",
    manual: zh ? "手动分配" : "Manual assignment",
    create: zh ? "创建实验" : "Create experiment",
    creating: zh ? "创建中..." : "Creating...",
    noQueries: zh ? "先生成或保留至少 2 个问题，才能创建受控实验。" : "Create or keep at least 2 questions before starting a controlled experiment.",
    selected: zh ? "已选问题" : "Selected questions",
    treatment: zh ? "处理组" : "Treatment",
    control: zh ? "对照组" : "Control",
    exclude: zh ? "排除" : "Exclude",
    baseline: zh ? "跑基线" : "Run baseline",
    retest: zh ? "跑复测" : "Run retest",
    recompute: zh ? "重新计算" : "Recompute",
    working: zh ? "处理中..." : "Working...",
    sampleCount: zh ? "每题样本" : "Samples per question",
  };
}

export function ProofExperimentBuilder({
  projectId,
  locale,
  queries,
  defaultMetric,
}: {
  projectId: string;
  locale: string;
  queries: QueryOption[];
  defaultMetric: string;
}) {
  const copy = copyFor(locale);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const initialIds = useMemo(() => queries.slice(0, 24).map((query) => query.id), [queries]);
  const [name, setName] = useState(locale === "zh-CN" ? "内容干预验证" : "Content intervention proof");
  const [hypothesis, setHypothesis] = useState("");
  const [metricKey, setMetricKey] = useState(defaultMetric);
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const [selectedIds, setSelectedIds] = useState<string[]>(initialIds);
  const [sampleCountPerQuery, setSampleCountPerQuery] = useState(1);
  const [arms, setArms] = useState<Record<string, Arm>>(() => {
    const midpoint = Math.ceil(initialIds.length / 2);
    return Object.fromEntries(initialIds.map((id, index) => [id, index < midpoint ? "treatment" : "control"]));
  });
  const [error, setError] = useState<string | null>(null);

  const selectedQueries = queries.filter((query) => selectedIds.includes(query.id));
  const canCreate =
    selectedQueries.length >= 2 &&
    (mode === "auto" ||
      (selectedQueries.some((query) => arms[query.id] === "treatment") &&
        selectedQueries.some((query) => arms[query.id] === "control")));

  function toggleQuery(queryId: string) {
    setSelectedIds((current) =>
      current.includes(queryId) ? current.filter((id) => id !== queryId) : [...current, queryId],
    );
  }

  function createExperiment() {
    setError(null);
    startTransition(async () => {
      const response = await fetch(`/api/projects/${projectId}/experiments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          hypothesis,
          metricKey,
          queryIds: selectedIds,
          sampleCountPerQuery,
          assignments:
            mode === "manual"
              ? selectedQueries
                  .filter((query) => arms[query.id] !== "exclude")
                  .map((query) => ({ queryId: query.id, arm: arms[query.id] === "control" ? "control" : "treatment" }))
              : undefined,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setError(typeof payload.error === "string" ? payload.error : "Could not create experiment.");
        return;
      }
      router.refresh();
    });
  }

  if (queries.length < 2) {
    return <p className="text-sm text-faint">{copy.noQueries}</p>;
  }

  return (
    <div className="panel-inset space-y-4 p-4">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <FlaskConical className="h-4 w-4 text-primary" />
        {copy.title}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="experiment-name">{copy.name}</Label>
          <Input id="experiment-name" value={name} onChange={(event) => setName(event.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="experiment-metric">{copy.metric}</Label>
          <select
            id="experiment-metric"
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm text-foreground"
            value={metricKey}
            onChange={(event) => setMetricKey(event.target.value)}
          >
            {metricOptions.map((metric) => (
              <option key={metric.value} value={metric.value}>
                {metric.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="experiment-hypothesis">{copy.hypothesis}</Label>
        <Textarea
          id="experiment-hypothesis"
          value={hypothesis}
          onChange={(event) => setHypothesis(event.target.value)}
          rows={2}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-border bg-card/40 p-1">
          {(["auto", "manual"] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={`rounded-md px-3 py-1 text-xs transition ${mode === value ? "bg-secondary text-foreground" : "text-faint"}`}
              onClick={() => setMode(value)}
            >
              {value === "auto" ? copy.auto : copy.manual}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="experiment-samples" className="text-xs text-faint">
            {copy.sampleCount}
          </Label>
          <Input
            id="experiment-samples"
            className="w-16"
            min={1}
            max={5}
            type="number"
            value={sampleCountPerQuery}
            onChange={(event) => setSampleCountPerQuery(Math.max(1, Math.min(5, Number(event.target.value) || 1)))}
          />
        </div>
      </div>

      <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
        {queries.slice(0, 40).map((query, index) => {
          const selected = selectedIds.includes(query.id);
          return (
            <div key={query.id} className="rounded-lg border border-border bg-card/35 p-3">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={selected}
                  onChange={() => toggleQuery(query.id)}
                  aria-label={`Select ${query.queryText}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="line-clamp-2 text-sm text-foreground">{query.queryText}</div>
                  <div className="mt-1 text-[11px] text-faint">{query.queryType}</div>
                </div>
                {mode === "manual" && selected ? (
                  <select
                    className="h-8 rounded-lg border border-input bg-transparent px-2 text-xs text-foreground"
                    value={arms[query.id] ?? (index % 2 === 0 ? "treatment" : "control")}
                    onChange={(event) => setArms((current) => ({ ...current, [query.id]: event.target.value as Arm }))}
                  >
                    <option value="treatment">{copy.treatment}</option>
                    <option value="control">{copy.control}</option>
                    <option value="exclude">{copy.exclude}</option>
                  </select>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-faint">
          {copy.selected}: {selectedQueries.length}
        </span>
        <Button type="button" onClick={createExperiment} disabled={!canCreate || isPending}>
          <FlaskConical className="h-4 w-4" />
          {isPending ? copy.creating : copy.create}
        </Button>
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

export function ExperimentWaveActions({
  projectId,
  experimentId,
  locale,
  hasBaseline,
  hasRetest,
}: {
  projectId: string;
  experimentId: string;
  locale: string;
  hasBaseline: boolean;
  hasRetest: boolean;
}) {
  const copy = copyFor(locale);
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function post(path: string, body?: unknown, action = path) {
    setError(null);
    setPendingAction(action);
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    setPendingAction(null);
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setError(typeof payload.error === "string" ? payload.error : "Request failed.");
      return;
    }
    router.refresh();
  }

  const wavePath = `/api/projects/${projectId}/experiments/${experimentId}/waves`;
  const computePath = `/api/projects/${projectId}/experiments/${experimentId}/compute`;

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      {!hasBaseline ? (
        <Button
          type="button"
          size="sm"
          onClick={() => post(wavePath, { waveType: "baseline", sampleCountPerQuery: 1 }, "baseline")}
          disabled={Boolean(pendingAction)}
        >
          <Play className="h-4 w-4" />
          {pendingAction === "baseline" ? copy.working : copy.baseline}
        </Button>
      ) : null}
      {hasBaseline && !hasRetest ? (
        <Button
          type="button"
          size="sm"
          onClick={() => post(wavePath, { waveType: "retest", sampleCountPerQuery: 1 }, "retest")}
          disabled={Boolean(pendingAction)}
        >
          <RefreshCw className="h-4 w-4" />
          {pendingAction === "retest" ? copy.working : copy.retest}
        </Button>
      ) : null}
      {hasBaseline ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => post(computePath, undefined, "compute")}
          disabled={Boolean(pendingAction)}
        >
          <Calculator className="h-4 w-4" />
          {pendingAction === "compute" ? copy.working : copy.recompute}
        </Button>
      ) : null}
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </div>
  );
}
