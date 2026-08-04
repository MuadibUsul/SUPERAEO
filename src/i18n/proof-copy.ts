export function getProofCopy(locale: string) {
  const zh = locale === "zh-CN";
  return {
    eyebrow: "Proof Layer",
    title: zh ? "效果验证" : "Proof",
    description: zh
      ? "证明 AI 认知的变化来自你的干预，而不是模型自身漂移；并把 AI 可见度和真实业务结果挂钩。"
      : "Prove the change in AI cognition came from your intervention — not background model drift — and tie AI visibility to real business outcomes.",
    causalTitle: zh ? "因果验证 · 处理组 vs 对照组" : "Causal proof · treatment vs control",
    causalHint: zh
      ? "把问题集分成「处理组」（执行内容干预）和「对照组」（保持不变）。对照组的变化代表模型漂移，从处理组的提升中扣掉它，剩下的才是你的功劳。"
      : "Split the question set into a treatment arm (intervention applied) and a control arm (left untouched). The control's movement is model drift; subtract it from the treatment gain and what remains is your effect.",
    treatment: zh ? "处理组" : "Treatment",
    control: zh ? "对照组（= 模型漂移基线）" : "Control (= model-drift baseline)",
    baseline: zh ? "基线" : "Baseline",
    retest: zh ? "复测" : "Retest",
    netLift: zh ? "净提升（已扣除漂移）" : "Net lift (drift removed)",
    drift: zh ? "模型漂移" : "Model drift",
    significant: zh ? "统计显著" : "Statistically significant",
    notSignificant: zh ? "未达显著" : "Not significant",
    pValue: zh ? "p 值" : "p-value",
    noExperiments: zh
      ? "还没有受控实验。创建一个处理/对照实验来证明干预效果。"
      : "No controlled experiments yet. Create a treatment/control experiment to prove intervention impact.",
    corrTitle: zh ? "真实结果相关性" : "Real-outcome correlation",
    corrHint: zh
      ? "把 AI 可见度时间序列和导入的真实业务结果（如 AI 转介会话）配对，计算相关性与领先滞后。"
      : "Pairs the AI-visibility time series with imported business outcomes (e.g. AI-referral sessions) and reports correlation and lead/lag.",
    sameDay: zh ? "同日相关性 r" : "Same-day correlation r",
    bestLag: zh ? "最佳滞后" : "Best lag",
    leadsBy: (n: number) => (zh ? `认知领先结果约 ${n} 天` : `Cognition leads outcome by ~${n} days`),
    sameDayLabel: zh ? "认知与结果同步" : "Cognition moves with outcome",
    pairedDays: zh ? "配对天数" : "Paired days",
    visibility: zh ? "AI 可见度" : "AI visibility",
    outcome: zh ? "业务结果" : "Outcome",
    noCorrelation: zh
      ? "还没有足够的可见度快照或导入的业务结果来计算相关性。"
      : "Not enough visibility snapshots or imported outcomes to compute a correlation yet.",
    samples: zh ? "样本" : "samples",
  };
}
