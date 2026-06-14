import { AlertTriangle, BarChart3, CheckCircle2, Clock3, Link2, Radar, Target } from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const emptyMetrics = [
  {
    label: "AI Visibility Score",
    value: "Pending",
    helper: "No baseline run",
    icon: BarChart3,
  },
  {
    label: "Mention Rate",
    value: "Pending",
    helper: "0 sampled answers",
    icon: CheckCircle2,
  },
  {
    label: "Recommendation Share",
    value: "Pending",
    helper: "No recommendations observed",
    icon: Target,
  },
  {
    label: "Citation Rate",
    value: "Pending",
    helper: "No citations stored",
    icon: Link2,
  },
  {
    label: "Stability Index",
    value: "Pending",
    helper: "Repeated sampling not run",
    icon: Clock3,
  },
  {
    label: "Entity Visibility",
    value: "Pending",
    helper: "Entity profile not built",
    icon: Radar,
  },
  {
    label: "Hallucination Risk",
    value: "Pending",
    helper: "No alert analysis",
    icon: AlertTriangle,
  },
];

type MetricCardsProps = {
  metrics?: {
    aiVisibilityScore: number;
    mentionRate: number;
    recommendationShare: number;
    citationRate: number;
    stabilityIndex: number;
    entityVisibility: number;
    hallucinationRiskScore: number;
  };
  sampleCount?: number;
};

export function MetricCards({ metrics, sampleCount = 0 }: MetricCardsProps) {
  const cards = metrics
    ? [
        {
          label: "AI Visibility Score",
          value: metrics.aiVisibilityScore.toFixed(2),
          helper: `${sampleCount} samples`,
          icon: BarChart3,
        },
        {
          label: "Mention Rate",
          value: metrics.mentionRate.toFixed(2),
          helper: `${sampleCount} sampled answers`,
          icon: CheckCircle2,
        },
        {
          label: "Recommendation Share",
          value: metrics.recommendationShare.toFixed(2),
          helper: "Observed recommendation ratio",
          icon: Target,
        },
        {
          label: "Citation Rate",
          value: metrics.citationRate.toFixed(2),
          helper: "Brand-supporting citations",
          icon: Link2,
        },
        {
          label: "Stability Index",
          value: metrics.stabilityIndex.toFixed(2),
          helper: "Repeated sampling consistency",
          icon: Clock3,
        },
        {
          label: "Entity Visibility",
          value: metrics.entityVisibility.toFixed(2),
          helper: "Authority and definition strength",
          icon: Radar,
        },
        {
          label: "Hallucination Risk",
          value: metrics.hallucinationRiskScore.toFixed(2),
          helper: "Open cognitive risk exposure",
          icon: AlertTriangle,
        },
      ]
    : emptyMetrics;

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {cards.map((metric) => {
        const Icon = metric.icon;

        return (
          <Card key={metric.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {metric.label}
              </CardTitle>
              <Icon className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="font-mono text-2xl font-semibold">
                {metric.value}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {metric.helper}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
