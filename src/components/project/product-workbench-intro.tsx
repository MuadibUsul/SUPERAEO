import Link from "next/link";
import type React from "react";
import {
  ArrowRight,
  CheckCircle2,
  FileText,
  GitCompare,
  Network,
  Radar,
  Search,
  ShieldAlert,
  Target,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const capabilityCards = [
  {
    title: "Does AI recognize the brand entity?",
    body: "Observe whether the brand enters the candidate answer space across recommendation, comparison, and buyer-intent queries.",
    icon: Search,
  },
  {
    title: "Why do competitors win the recommendation set?",
    body: "Compare entity presence, semantic fit, citations, and recommendation context to find the real entry gap.",
    icon: GitCompare,
  },
  {
    title: "Which signals are still missing?",
    body: "Pinpoint missing concepts, weak sources, schema gaps, and trust signals that reduce recognition and inclusion.",
    icon: ShieldAlert,
  },
  {
    title: "Can improvement be retested?",
    body: "Keep the baseline, rerun the same query set, and validate whether inclusion, stability, and citations actually moved.",
    icon: CheckCircle2,
  },
];

const workflowSteps = [
  "Create the project baseline",
  "Add competitors and market context",
  "Generate semantic keywords",
  "Generate buyer-intent queries",
  "Sample AI answers",
  "Extract mentions and citations",
  "Measure stability and confidence",
  "Generate correction plan",
  "Retest and compare",
];

const reportItems = [
  "AI Visibility and citation metrics",
  "Mention and recommendation share",
  "Competitor delta and evidence",
  "Entity and semantic map snapshot",
  "Risk and hallucination alerts",
  "Retest-ready action plan",
];

export function ProductWorkbenchIntro({ projectCount }: { projectCount: number }) {
  return (
    <section className="space-y-5" aria-labelledby="workbench-title">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">CIP / EGO Workflow</Badge>
            <Badge variant="outline">Observable AI Answer Space</Badge>
          </div>
          <div className="mt-6 max-w-4xl">
            <h1 id="workbench-title" className="text-3xl font-semibold tracking-normal sm:text-4xl">
              Find why AI recommends competitors instead of you
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">
              CIP turns project setup, competitor analysis, query sampling, citation extraction,
              stability measurement, and corrective action planning into one operational workflow.
            </p>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/zh-CN/app/projects/new">
                Start a baseline project
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <a href="#competitor-map">
                View relationship example
                <Network className="h-4 w-4" />
              </a>
            </Button>
          </div>

          <div className="mt-7 grid gap-3 md:grid-cols-4">
            <SignalMetric label="Target queries" value="50-100" tone="text-cyan" />
            <SignalMetric label="Keywords" value="25-30" tone="text-emerald" />
            <SignalMetric label="Primary platform" value="OpenAI" tone="text-violet" />
            <SignalMetric label="Live projects" value={String(projectCount)} tone="text-gold" />
          </div>
        </div>

        <div id="competitor-map" className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Competitor relationship preview</p>
              <p className="mt-1 text-xs text-muted-foreground">
                A quick view of how a brand can sit inside the sampled answer space.
              </p>
            </div>
            <Radar className="h-5 w-5 text-primary" />
          </div>

          <div className="mt-6 min-h-72 rounded-lg border border-border bg-background/60 p-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
              <MiniNode label="Competitor A" detail="recommended often" tone="amber" />
              <Connector label="wins" />
              <MiniNode label="Buyer query" detail="best tools for..." tone="sky" />
            </div>
            <div className="my-5 grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
              <MiniNode label="Your Brand" detail="mentioned sometimes" tone="emerald" strong />
              <Connector label="weak source" />
              <MiniNode label="Citation gap" detail="few trusted references" tone="rose" />
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
              <MiniNode label="Target concept" detail="category fit" tone="violet" />
              <Connector label="missing link" muted />
              <MiniNode label="Action plan" detail="content + entity + schema" tone="slate" />
            </div>
          </div>

          <p className="mt-4 text-xs leading-5 text-muted-foreground">
            This graph only reflects observed relationships in sampled answers: mentions,
            recommendations, co-occurrence, citations, and risk associations.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {capabilityCards.map((capability) => {
          const Icon = capability.icon;

          return (
            <Card key={capability.title}>
              <CardHeader>
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Icon className="h-4 w-4" />
                </div>
                <CardTitle>{capability.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-6 text-muted-foreground">{capability.body}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <Card id="workflow">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              <CardTitle>Full optimization loop</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 md:grid-cols-3">
              {workflowSteps.map((step, index) => (
                <div
                  key={step}
                  className="flex items-center gap-3 rounded-md border border-border bg-background/50 px-3 py-3"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted font-mono text-xs text-muted-foreground">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="text-sm">{step}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card id="deliverables">
          <CardHeader>
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              <CardTitle>Client-ready outputs</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {reportItems.map((item) => (
              <div key={item} className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                <span className="text-sm text-muted-foreground">{item}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function SignalMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-background/70 px-4 py-3">
      <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{label}</div>
      <div className={`mt-2 text-base font-semibold ${tone}`}>{value}</div>
    </div>
  );
}

function MiniNode({
  label,
  detail,
  tone,
  strong = false,
}: {
  label: string;
  detail: string;
  tone: "amber" | "sky" | "emerald" | "rose" | "violet" | "slate";
  strong?: boolean;
}) {
  const toneClass: Record<typeof tone, string> = {
    amber: "border-gold/30 bg-gold/10 text-gold",
    sky: "border-cyan/30 bg-cyan/10 text-cyan",
    emerald: "border-emerald/30 bg-emerald/10 text-emerald",
    rose: "border-rose/30 bg-rose/10 text-rose",
    violet: "border-violet/30 bg-violet/10 text-violet",
    slate: "border-border bg-muted text-muted-foreground",
  };

  return (
    <div className={`rounded-lg border px-3 py-3 ${toneClass[tone]} ${strong ? "shadow-sm" : ""}`}>
      <div className="text-sm font-medium">{label}</div>
      <div className="mt-1 text-xs opacity-80">{detail}</div>
    </div>
  );
}

function Connector({ label, muted = false }: { label: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-center text-xs text-muted-foreground">
      <span className={muted ? "opacity-70" : ""}>{label}</span>
    </div>
  );
}
