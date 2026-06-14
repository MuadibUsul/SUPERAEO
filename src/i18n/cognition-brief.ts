import type { Locale } from "@/i18n/config";

const cognitionBriefCopy = {
  "zh-CN": {
    eyebrow: "AI 认知简报",
    evidenceEarly: "早期证据",
    evidenceGrowing: "证据积累中",
    evidenceStrong: "证据较强",
    backedBy: "基于 {samples} 条采样回答、{terms} 个语义词、{opportunities} 个机会点。",
    notEnoughEvidence: "证据还不够",
    semanticHighlights: "语义重点",
    positiveTerms: "最强正向语义",
    riskTerms: "主要风险语义",
    competitorTerms: "竞品占据语义",
    missingTerms: "缺失理想语义",
    keyRisks: "关键风险",
    recommendedNextActions: "建议下一步",
    topOpportunities: "优先机会",
    reviewOpportunities: "查看机会",
    openReport: "打开报告",
    exploreNebula: "探索星云",
    noHighlights: "还没有足够的语义证据来显示这一组内容。",
    noRisks: "当前没有打开的关键风险。",
    noOpportunities: "还没有可展示的高优先机会。",
    noAction: "先完成一次审计，系统才会给出明确的下一步。",
    pendingSummary: "还没有足够的采样证据。先启动审计，系统会生成第一份 AI 认知简报。",
    scoreLabels: {
      recognition: "识别",
      semanticClarity: "语义清晰度",
      trust: "信任",
      recommendation: "推荐",
      risk: "风险",
      opportunity: "机会",
    },
    summaryTemplates: {
      rich: "AI 当前主要把 {subject} 与 {positive} 绑定，但在 {weakness} 上仍然偏弱，并在 {opportunity} 这类问题里存在可切入机会。",
      basic: "AI 已经能在部分回答里识别 {subject}，但仍需要更清晰的语义证据和更稳定的推荐场景。",
      empty: "AI 还没有为 {subject} 形成足够稳定的可观测认知，需要先完成一次采样审计。",
    },
    actionTemplates: {
      opportunity: "优先为“{scenario}”建设 FAQ、对比页或场景内容，先拿下最强机会位。",
      missing: "补足“{term}”相关的可验证证据，让 AI 更容易把它稳定地和你关联起来。",
      competitor: "围绕“{term}”制作对比证据，削弱竞品在该语义位上的默认占据。",
      risk: "针对“{term}”补一层澄清内容，避免风险语义继续主导回答。",
      generic: "完成一次新的审计采样，确认当前回答空间里最值得优先抢占的问题。",
    },
    riskMessages: {
      alert: "{title}：{message}",
      term: "AI 回答里反复靠近“{term}”，这是当前需要优先澄清的风险语义。",
    },
    opportunityReason: "LOP {score} · {scenario}",
  },
  en: {
    eyebrow: "AI Cognition Brief",
    evidenceEarly: "Early evidence",
    evidenceGrowing: "Growing evidence",
    evidenceStrong: "Strong evidence",
    backedBy: "Backed by {samples} sampled answers, {terms} semantic terms, and {opportunities} mapped opportunities.",
    notEnoughEvidence: "Not enough evidence",
    semanticHighlights: "Semantic Highlights",
    positiveTerms: "Strongest positive terms",
    riskTerms: "Key risk terms",
    competitorTerms: "Competitor-owned terms",
    missingTerms: "Missing desired terms",
    keyRisks: "Key Risks",
    recommendedNextActions: "Recommended Next Actions",
    topOpportunities: "Top Opportunities",
    reviewOpportunities: "Review Opportunities",
    openReport: "Open Report",
    exploreNebula: "Explore Nebula",
    noHighlights: "There is not enough semantic evidence to show this group yet.",
    noRisks: "There are no open key risks right now.",
    noOpportunities: "No high-priority opportunities are ready yet.",
    noAction: "Complete one audit first so the system can recommend a clear next step.",
    pendingSummary: "There is not enough sampled evidence yet. Start Diagnosis to generate the first AI cognition brief.",
    scoreLabels: {
      recognition: "Recognition",
      semanticClarity: "Semantic Clarity",
      trust: "Trust",
      recommendation: "Recommendation",
      risk: "Risk",
      opportunity: "Opportunity",
    },
    summaryTemplates: {
      rich: "AI currently ties {subject} most strongly to {positive}, but it is still weak in {weakness} and has open opportunities in questions around {opportunity}.",
      basic: "AI can recognize {subject} in some answers, but the semantic field still needs clearer evidence and more stable recommendation contexts.",
      empty: "AI has not formed a stable observable understanding of {subject} yet. The next step is to complete one sampled audit.",
    },
    actionTemplates: {
      opportunity: "Build FAQ, comparison, or scenario content for “{scenario}” first to capture the strongest open opportunity.",
      missing: "Add verifiable evidence around “{term}” so AI can connect it to you more consistently.",
      competitor: "Create comparison evidence around “{term}” to weaken competitor default ownership in that semantic slot.",
      risk: "Publish a clarifying evidence layer around “{term}” so risk semantics stop dominating the answer space.",
      generic: "Run a fresh audit sample to confirm which answer-space question should be attacked first.",
    },
    riskMessages: {
      alert: "{title}: {message}",
      term: "AI repeatedly moves close to “{term}”. This is the main risk semantic to clarify next.",
    },
    opportunityReason: "LOP {score} · {scenario}",
  },
} as const;

export function getCognitionBriefCopy(locale: Locale) {
  return cognitionBriefCopy[locale];
}

export function formatBriefTemplate(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));
}
