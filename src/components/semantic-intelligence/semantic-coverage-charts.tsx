"use client";

import { Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

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
              <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.2} />
              <XAxis type="number" domain={[0, 100]} tickFormatter={(value) => `${value}%`} fontSize={11} />
              <YAxis dataKey="domain" type="category" width={118} fontSize={10} />
              <Tooltip formatter={(value) => [`${Number(value).toFixed(1)}%`, copy.domains]} />
              <Bar dataKey="coverage" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
      <section className="rounded-md border border-border p-4">
        <h3 className="mb-4 text-sm font-medium">{copy.discovery}</h3>
        <div className="h-[360px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={history} margin={{ left: 4, right: 12 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="iteration" label={{ value: copy.iteration, position: "insideBottom", offset: -2 }} fontSize={11} />
              <YAxis yAxisId="clusters" fontSize={11} />
              <YAxis yAxisId="novelty" orientation="right" domain={[0, 1]} tickFormatter={(value) => `${Math.round(value * 100)}%`} fontSize={11} />
              <Tooltip />
              <Bar yAxisId="clusters" dataKey="clusters" name={copy.clusters} fill="hsl(var(--muted-foreground))" opacity={0.35} />
              <Line yAxisId="novelty" type="monotone" dataKey="clusterNovelty" name={copy.novelty} stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}
