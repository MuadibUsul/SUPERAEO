"use client";

/**
 * "What changed since last run" — a compact, skimmable read of a NebulaDiff.
 * Turns the time-bounded snapshots the platform already stores into an
 * actionable view: which associations appeared, strengthened, weakened or fell
 * away between two runs. Presentational only; the diff is computed in
 * `nebula-diff.ts`.
 */
import type { MetricDelta, NebulaDiff, NodeDelta } from "@/components/semantic-intelligence/nebula-diff";
import type { UniverseType } from "@/components/semantic-intelligence/universe-adapter";
import { cn } from "@/lib/utils";

const HUE: Record<UniverseType, string> = {
  positive: "56,224,161", risk: "255,82,119", opportunity: "255,190,72", competitor: "190,104,255",
  entity: "65,220,235", attribute: "72,176,255", context: "91,122,255", activity: "255,139,76",
  relation: "148,118,255", evidence: "202,211,226",
};

type Copy = {
  title: string;
  since: string;
  appeared: string;
  disappeared: string;
  rose: string;
  fell: string;
  empty: string;
  more: string;
};

const DEFAULT_COPY: Copy = {
  title: "What changed since last run",
  since: "vs previous run",
  appeared: "New associations",
  disappeared: "Fell away",
  rose: "Strengthened",
  fell: "Weakened",
  empty: "No earlier run to compare against yet.",
  more: "more",
};

function pct(value: number) {
  return Math.round(value * 100);
}

function MetricChip({ metric, label }: { metric: MetricDelta; label: string }) {
  const d = metric.delta;
  const dir = d === null || d === 0 ? "flat" : d > 0 ? "up" : "down";
  return (
    <div className="flex items-baseline gap-1.5 rounded-lg border border-border bg-card px-3 py-2">
      <span className="text-[11px] leading-4 text-muted-foreground">{label}</span>
      <span className="metric-number text-sm font-semibold">{metric.current ?? "--"}</span>
      {d !== null && d !== 0 ? (
        <span className={cn("font-mono text-[11px]", dir === "up" ? "text-emerald-400" : "text-rose-400")}>
          {dir === "up" ? "▲" : "▼"}{Math.abs(d)}
        </span>
      ) : null}
    </div>
  );
}

function NodeRow({ item, showDelta }: { item: NodeDelta; showDelta: "signed" | "value" }) {
  return (
    <li className="flex items-center gap-2 py-1 text-[12px]">
      <span className="size-2 shrink-0 rounded-full" style={{ background: `rgb(${HUE[item.type]})`, boxShadow: `0 0 6px rgb(${HUE[item.type]})` }} />
      <span className="min-w-0 flex-1 truncate text-foreground" title={item.label}>{item.label}</span>
      <span className={cn("shrink-0 font-mono text-[11px]", item.delta >= 0 ? "text-emerald-400" : "text-rose-400")}>
        {showDelta === "signed" ? `${item.delta >= 0 ? "+" : "−"}${Math.abs(pct(item.delta))}` : pct(item.affinity)}
      </span>
    </li>
  );
}

function Section({ title, items, total, showDelta, copy }: {
  title: string; items: NodeDelta[]; total: number; showDelta: "signed" | "value"; copy: Copy;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-card p-3">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[12px] font-medium text-foreground">{title}</span>
        <span className="metric-number text-[13px] font-semibold text-muted-foreground">{total}</span>
      </div>
      {items.length === 0 ? (
        <div className="py-2 text-[11px] text-muted-foreground">—</div>
      ) : (
        <ul className="min-w-0">
          {items.map((item, i) => <NodeRow key={`${item.label}-${i}`} item={item} showDelta={showDelta} />)}
          {total > items.length ? (
            <li className="pt-1 text-[11px] text-muted-foreground">+{total - items.length} {copy.more}</li>
          ) : null}
        </ul>
      )}
    </div>
  );
}

export function NebulaChangePanel({
  diff,
  metrics = [],
  metricLabels = {},
  previousAt,
  currentAt,
  hasPrevious,
  copy: partialCopy,
  className,
}: {
  diff: NebulaDiff;
  metrics?: MetricDelta[];
  metricLabels?: Record<string, string>;
  previousAt?: string;
  currentAt?: string;
  hasPrevious: boolean;
  copy?: Partial<Copy>;
  className?: string;
}) {
  const copy = { ...DEFAULT_COPY, ...partialCopy };

  if (!hasPrevious) {
    return (
      <div className={cn("rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground", className)}>
        {copy.empty}
      </div>
    );
  }

  const shownMetrics = metrics.filter((m) => m.delta !== null && m.delta !== 0);

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">{copy.title}</h3>
        {previousAt && currentAt ? (
          <span className="font-mono text-[11px] text-muted-foreground">{previousAt} → {currentAt}</span>
        ) : (
          <span className="font-mono text-[11px] text-muted-foreground">{copy.since}</span>
        )}
      </div>

      {shownMetrics.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {shownMetrics.map((m) => <MetricChip key={m.key} metric={m} label={metricLabels[m.key] ?? m.key} />)}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <Section title={copy.appeared} items={diff.appeared} total={diff.counts.appeared} showDelta="value" copy={copy} />
        <Section title={copy.rose} items={diff.rose} total={diff.counts.rose} showDelta="signed" copy={copy} />
        <Section title={copy.fell} items={diff.fell} total={diff.counts.fell} showDelta="signed" copy={copy} />
        <Section title={copy.disappeared} items={diff.disappeared} total={diff.counts.disappeared} showDelta="value" copy={copy} />
      </div>
    </div>
  );
}
