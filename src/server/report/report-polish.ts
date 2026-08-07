/**
 * AI prose-polish over the deterministic report analysis.
 *
 * The rule-based skeleton (`report-analysis.ts`) is the source of truth and
 * the fallback. This layer asks an AI to rewrite each metric's points into
 * flowing prose — but only to REPHRASE the facts we already derived, never to
 * introduce a new number or claim. Any failure (no provider, bad JSON,
 * timeout) returns the deterministic analysis unchanged, so a report is never
 * blocked by the AI.
 */
import { z } from "zod";
import type { Locale } from "@/i18n/config";
import { runJsonPrompt } from "@/server/ai/json-executor";
import type { ReportAnalysis } from "@/server/report/report-analysis";

export const reportPolishPromptVersion = "2026-08-08.v1";

const polishSchema = z.object({
  verdict: z.string(),
  metrics: z.array(z.object({ key: z.string(), narrative: z.string() })),
});

export async function polishReportAnalysis(input: {
  analysis: ReportAnalysis;
  subjectName: string;
  locale: Locale;
  projectId?: string;
  subjectId?: string;
}): Promise<ReportAnalysis> {
  const { analysis, locale } = input;
  if (analysis.metrics.length === 0) return analysis;
  const zh = locale === "zh-CN";

  // Feed ONLY the facts we already derived; forbid new numbers or claims.
  const facts = {
    subject: input.subjectName,
    verdict: analysis.verdict,
    metrics: analysis.metrics.map((metric) => ({
      key: metric.key,
      label: metric.label,
      percent: metric.percent,
      tone: metric.tone,
      context: metric.context,
      drivers: metric.drivers,
      causal: metric.causal,
      impact: metric.impact,
    })),
  };

  const system = zh
    ? "你是资深 AI 认知分析师。只依据给定事实，为每个指标写 2-3 句连贯、专业、有洞察的中文分析（把 context 与 drivers 自然串联）。严禁引入任何新的数字、事实或结论——只能重述与串联给定内容；不确定就更保守。verdict 改写成一句总判。返回严格 JSON。"
    : "You are a senior AI-cognition analyst. Using ONLY the given facts, write 2-3 sentences of coherent, professional, insightful prose per metric (weave the context and drivers together). Never introduce a new number, fact, or claim — only rephrase and connect what is given; when unsure, be conservative. Rewrite the verdict into one sharp sentence. Return strict JSON.";

  try {
    const result = await runJsonPrompt({
      projectId: input.projectId,
      subjectId: input.subjectId,
      promptName: "report_analysis_polish",
      promptVersion: reportPolishPromptVersion,
      system,
      prompt: JSON.stringify(facts),
      schema: polishSchema,
      schemaName: "report_analysis_polish",
      maxOutputTokens: 1000,
      temperature: 0.4,
    });
    if (!result.ok) return analysis;

    const byKey = new Map(result.data.metrics.map((metric) => [metric.key, metric.narrative.trim()]));
    return {
      headline: analysis.headline,
      verdict: result.data.verdict.trim() || analysis.verdict,
      metrics: analysis.metrics.map((metric) => {
        const narrative = byKey.get(metric.key);
        // Replace the terse context+drivers with the woven prose; keep the
        // causal evidence and the impact lever as their own emphasized lines.
        return narrative ? { ...metric, context: narrative, drivers: [] } : metric;
      }),
    };
  } catch {
    return analysis; // deterministic fallback — never block the report
  }
}
