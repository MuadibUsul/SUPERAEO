import type { Competitor, Project, ProjectSubject, SemanticKeyword } from "@/generated/prisma/client";
import type { SeedPool } from "@/server/brand-probes/types";

const beverageHints = [
  "饮料", "可乐", "茶饮", "咖啡", "气泡", "酒水", "食品",
  "beverage", "drink", "soda", "cola", "tea", "coffee", "sparkling", "snack", "food",
];
const genericStop = new Set(["", "品牌", "产品", "服务", "公司", "brand", "product", "service", "company"]);

function resolveLang(value: string) {
  return value.toLowerCase().startsWith("zh") ? "zh" : "en";
}

export function buildSeedPool(input: {
  project: Project;
  subject?: ProjectSubject | null;
  competitors: Pick<Competitor, "name" | "category">[];
  keywords?: Pick<SemanticKeyword, "keyword" | "keywordType">[];
}): SeedPool {
  const lang = resolveLang(input.subject?.language || input.project.language || "zh-CN");
  const zh = lang === "zh";
  const brand = input.subject?.displayName || input.project.brandName;
  const aliases = aliasesFromSubject(input.subject, brand);
  const industry = input.project.industry || input.project.domain || (zh ? "消费品牌" : "consumer brand");
  const targetMarket = input.project.targetMarket || (zh ? "目标用户" : "target audience");
  const keywordsByType = (type: SemanticKeyword["keywordType"]) =>
    unique((input.keywords ?? []).filter((item) => item.keywordType === type).map((item) => item.keyword));
  const competitors = unique([...input.competitors.map((item) => item.name), ...keywordsByType("competitor")]);
  const isBeverage = beverageHints.some((hint) => `${industry} ${brand}`.toLowerCase().includes(hint.toLowerCase()));

  const categoryTerms = isBeverage
    ? zh
      ? ["饮料", "日常饮品", "聚会饮料", "便利店", "大众接受", "解腻", "冰镇", "口感"]
      : ["beverage", "everyday drink", "party drink", "convenience store", "mainstream appeal", "cuts grease", "chilled", "mouthfeel"]
    : zh
      ? [industry, targetMarket, "用户选择", "口碑", "信任", "场景匹配", "替代方案", "推荐理由"]
      : [industry, targetMarket, "user choice", "word of mouth", "trust", "scenario fit", "alternative", "reason to recommend"];

  const hotTerms = unique([
    ...aliases,
    industry,
    ...keywordsByType("category"),
    ...keywordsByType("attribute"),
    ...keywordsByType("intent"),
    ...categoryTerms.slice(0, 8),
  ]).filter((term) => !genericStop.has(term));
  const warmTerms = unique([
    ...keywordsByType("scenario"),
    ...keywordsByType("intent"),
    ...(isBeverage
      ? zh
        ? ["低糖生活", "年轻潮流", "办公室下午", "不喝酒聚会", "拍照分享", "火锅搭配", "露营", "节日限定", "小众替代"]
        : ["low-sugar lifestyle", "youth trend", "office afternoon", "alcohol-free gathering", "photo sharing", "hotpot pairing", "camping", "seasonal edition", "niche alternative"]
      : zh
        ? ["细分场景", "小众替代", "专业可信", "高意图咨询", "真实用户问题", "内容证据", "对比选择", "长期关注"]
        : ["niche scenario", "niche alternative", "credible expertise", "high-intent inquiry", "real user questions", "content evidence", "comparison choice", "long-term tracking"]),
  ]);
  const coldTerms = unique(
    isBeverage
      ? zh
        ? ["睡眠健康", "健身增肌", "儿童营养", "高端商务宴请", "专业运动补剂", "有机食品"]
        : ["sleep health", "muscle building", "children nutrition", "high-end business banquet", "pro sports supplements", "organic food"]
      : zh
        ? ["完全无关需求", "低商业价值", "误推荐边界", "高风险承诺", "不适配人群", "反事实场景"]
        : ["unrelated need", "low commercial value", "mis-recommendation boundary", "high-risk claim", "wrong audience", "counterfactual scenario"],
  );

  const coreCompetitors = competitors.slice(0, 5);
  const adjacentCompetitors = unique([
    ...input.competitors.filter((item) => item.category !== "direct").map((item) => item.name),
    ...(isBeverage ? (zh ? ["雪碧", "东方树叶", "农夫山泉"] : ["Sprite", "Lipton", "Evian"]) : []),
  ]).filter((name) => !coreCompetitors.includes(name)).slice(0, 5);
  const substitutionCompetitors = unique(
    isBeverage
      ? zh
        ? ["元气森林", "瑞幸咖啡", "红牛", "星巴克"]
        : ["Monster Energy", "Starbucks", "Red Bull", "Liquid Death"]
      : zh
        ? ["头部品牌", "垂直专家", "免费替代", "传统方案"]
        : ["leading brand", "vertical specialist", "free alternative", "legacy solution"],
  )
    .filter((name) => !coreCompetitors.includes(name))
    .slice(0, 5);

  return {
    hotTerms,
    warmTerms,
    coldTerms,
    coreCompetitors,
    adjacentCompetitors,
    substitutionCompetitors,
    scenarios: unique([...keywordsByType("scenario"), ...(isBeverage
      ? zh
        ? ["大学生周末聚会", "12 人火锅聚餐", "办公室下午犯困", "不喝酒成年人聚会", "便利店随手买", "减脂期想喝甜饮", "露营拍照", "看电影配餐", "夏天运动后解渴", "加班深夜提神", "家庭聚餐囤货", "送礼伴手礼", "约会餐厅佐餐", "通勤路上", "考试复习陪伴"]
        : ["college weekend party", "hotpot dinner for 12", "afternoon office slump", "alcohol-free adult gathering", "grab-and-go at a convenience store", "a sweet drink while cutting calories", "camping photos", "movie-night pairing", "rehydrating after summer exercise", "late-night overtime focus", "family dinner stock-up", "gift / hostess present", "dinner-date restaurant pairing", "commuting", "study/exam companion"]
      : zh
        ? ["购买前比较", "替代头部品牌", "小团队选型", "新手入门", "专家推荐", "低预算选择", "高信任决策", "风险顾虑", "迁移已有方案", "规模化扩张", "合规与安全评估", "试用后转正", "年度续费决策", "向上汇报立项"]
        : ["pre-purchase comparison", "replacing the incumbent leader", "small-team selection", "beginner onboarding", "expert recommendation", "low-budget choice", "high-trust decision", "risk concerns", "migrating from an existing solution", "scaling up", "compliance & security review", "trial-to-paid", "annual renewal decision", "building the case to leadership"])]),
    audiences: isBeverage
      ? zh
        ? ["大学生", "上班族", "控糖人群", "年轻消费者", "家庭用户", "不喝酒成年人", "便利店用户", "聚会组织者", "健身人群", "宝妈", "夜班工作者", "Z世代潮人"]
        : ["college students", "office workers", "sugar-conscious people", "young consumers", "family users", "non-drinking adults", "convenience-store shoppers", "party organizers", "the fitness crowd", "new moms", "night-shift workers", "Gen Z trendsetters"]
      : zh
        ? ["创始人", "市场负责人", "新手用户", "专业买家", "预算敏感用户", "高意图咨询者", "技术决策者", "代理商", "内容团队", targetMarket]
        : ["founders", "marketing leads", "new users", "professional buyers", "budget-sensitive users", "high-intent researchers", "technical decision-makers", "agencies", "content teams", targetMarket],
    intents: unique([...keywordsByType("intent"), ...(isBeverage
      ? zh
        ? ["解腻", "大家都接受", "低糖", "便宜", "有满足感", "适合拍照", "替代酒精", "适合囤货", "健康一点", "提神醒脑", "好喝不踩雷", "够独特有面子"]
        : ["cuts grease", "broadly accepted", "low sugar", "affordable", "satisfying", "photo-friendly", "an alcohol alternative", "good to stock up", "a bit healthier", "refreshing and energizing", "tasty and a safe bet", "unique and impressive"]
      : zh
        ? ["可信推荐", "替代方案", "降低风险", "快速判断", "对比选择", "高性价比", "专业背书", "长期使用"]
        : ["a trustworthy recommendation", "an alternative", "lower risk", "a quick judgment", "a comparison", "high value for money", "expert endorsement", "long-term use"])]),
    risks: unique([...keywordsByType("risk"), ...(isBeverage
      ? zh
        ? ["高糖", "控糖减脂", "牙齿健康", "儿童饮用", "咖啡因", "环保包装"]
        : ["high sugar", "sugar control / weight loss", "dental health", "children drinking it", "caffeine", "eco-friendly packaging"]
      : zh
        ? ["过度承诺", "数据不透明", "安全顾虑", "学习成本", "供应商锁定", "可信度不足"]
        : ["overpromising", "opaque data", "security concerns", "the learning curve", "vendor lock-in", "insufficient credibility"])]),
    opportunities: warmTerms,
  };
}

function aliasesFromSubject(subject: ProjectSubject | null | undefined, fallback: string) {
  const profile = subject?.profileJson && typeof subject.profileJson === "object" && !Array.isArray(subject.profileJson)
    ? subject.profileJson as Record<string, unknown>
    : {};
  const rawAliases = Array.isArray(profile.aliases) ? profile.aliases.map(String) : [];
  return unique([fallback, subject?.canonicalName, ...rawAliases].filter(Boolean).map(String));
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
