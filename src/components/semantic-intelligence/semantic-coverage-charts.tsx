"use client";

import { Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const axisTick = { fill: "var(--muted-foreground)" };
const axisLine = { stroke: "var(--border-strong)" };
const tooltipStyle = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  color: "var(--popover-foreground)",
};

export function SemanticCoverageCharts({
  domains,
  history,
  copy,
}: {
  domains: Array<{ domain: string; coverage: number }>;
  history: Array<{ iteration: number; clusters: number; clusterNovelty: number }>;
  copy: { domains: string; discovery: string; iteration: string; clusters: string; novelty: string };
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="rounded-md border border-border p-4">
        <h3 className="mb-4 text-sm font-medium">{copy.domains}</h3>
        <div className="h-[360px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={domains} layout="vertical" margin={{ left: 18, right: 18 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} opacity={0.55} />
              <XAxis type="number" domain={[0, 100]} tick={axisTick} axisLine={axisLine} tickLine={axisLine} tickFormatter={(value) => `${value}%`} fontSize={11} />
              <YAxis dataKey="domain" type="category" width={118} tick={axisTick} axisLine={axisLine} tickLine={axisLine} fontSize={10} />
              <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: "var(--popover-foreground)" }} formatter={(value) => [`${Number(value).toFixed(1)}%`, copy.domains]} />
              <Bar dataKey="coverage" fill="var(--chart-4)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
      <section className="rounded-md border border-border p-4">
        <h3 className="mb-4 text-sm font-medium">{copy.discovery}</h3>
        <div className="h-[360px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={history} margin={{ left: 4, right: 12 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" opacity={0.55} />
              <XAxis dataKey="iteration" tick={axisTick} axisLine={axisLine} tickLine={axisLine} label={{ value: copy.iteration, position: "insideBottom", offset: -2, fill: "var(--muted-foreground)" }} fontSize={11} />
              <YAxis yAxisId="clusters" tick={axisTick} axisLine={axisLine} tickLine={axisLine} fontSize={11} />
              <YAxis yAxisId="novelty" orientation="right" domain={[0, 1]} tick={axisTick} axisLine={axisLine} tickLine={axisLine} tickFormatter={(value) => `${Math.round(value * 100)}%`} fontSize={11} />
              <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: "var(--popover-foreground)" }} />
              <Bar yAxisId="clusters" dataKey="clusters" name={copy.clusters} fill="var(--chart-3)" opacity={0.55} radius={[4, 4, 0, 0]} />
              <Line
                yAxisId="novelty"
                type="monotone"
                dataKey="clusterNovelty"
                name={copy.novelty}
                stroke="var(--chart-5)"
                strokeWidth={2}
                dot={history.length === 1 ? { r: 4, fill: "var(--chart-5)", stroke: "var(--background)", strokeWidth: 2 } : false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}
