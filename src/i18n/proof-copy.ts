export function getProofCopy(locale: string) {
  const zh = locale === "zh-CN";
  return {
    eyebrow: "Proof Layer",
    title: zh ? "效果验证" : "Proof",
    description: zh
      ? "估计扣除对照组变化后的干预净效果，并与真实业务结果进行观察性关联分析。"
      : "Estimate intervention effects after accounting for control-arm movement, and compare visibility with business outcomes observationally.",
    causalTitle: zh ? "准实验评估 · 处理组 vs 对照组" : "Quasi-experimental estimate · treatment vs control",
    causalHint: zh
      ? "问题按类型与基线置信带进行固定种子分层分组。净差异仍依赖共同趋势等假设；未满足预注册、功效和配置一致性时只作方向性解读。"
      : "Questions are assigned with seeded stratification by type and baseline-confidence band. Net differences still rely on assumptions such as parallel trends; results remain directional unless protocol gates pass.",
    treatment: zh ? "处理组" : "Treatment",
    control: zh ? "对照组（= 模型漂移基线）" : "Control (= model-drift baseline)",
    baseline: zh ? "基线" : "Baseline",
    retest: zh ? "复测" : "Retest",
    netLift: zh ? "净提升（已扣除漂移）" : "Net lift (drift removed)",
    drift: zh ? "模型漂移" : "Model drift",
    significant: zh ? "随机化检验显著" : "Randomization test significant",
    notSignificant: zh ? "未达显著" : "Not significant",
    pValue: zh ? "p 值" : "p-value",
    noExperiments: zh
      ? "还没有实验。创建处理/对照实验来估计干预效果。"
      : "No experiment yet. Create a treatment/control experiment to estimate intervention impact.",
    corrTitle: zh ? "真实结果观察性相关" : "Observational correlation with real outcomes",
    corrHint: zh
      ? "把 AI 可见度时间序列和导入的真实业务结果（如 AI 转介会话）配对，计算相关性与领先滞后。"
      : "Pairs the AI-visibility time series with imported business outcomes (e.g. AI-referral sessions) and reports correlation and lead/lag.",
    sameDay: zh ? "同日相关性 r" : "Same-day correlation r",
    bestLag: zh ? "最佳滞后" : "Best lag",
    leadsBy: (n: number) => (zh ? `最大相关出现在约 +${n} 天（不代表因果）` : `Strongest correlation occurs near +${n} days (not causal)`),
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
