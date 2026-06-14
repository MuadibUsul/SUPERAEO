import type { Competitor, Project, ProjectSubject } from "@/generated/prisma/client";
import type { SeedPool } from "@/server/brand-probes/types";

const beverageHints = ["饮料", "可乐", "茶饮", "咖啡", "气泡", "酒水", "食品"];
const genericStop = new Set(["", "品牌", "产品", "服务", "公司"]);

export function buildSeedPool(input: {
  project: Project;
  subject?: ProjectSubject | null;
  competitors: Pick<Competitor, "name" | "category">[];
}): SeedPool {
  const brand = input.subject?.displayName || input.project.brandName;
  const aliases = aliasesFromSubject(input.subject, brand);
  const industry = input.project.industry || input.project.domain || "消费品牌";
  const targetMarket = input.project.targetMarket || "目标用户";
  const competitors = unique(input.competitors.map((item) => item.name));
  const isBeverage = beverageHints.some((hint) => `${industry} ${brand}`.includes(hint));

  const categoryTerms = isBeverage
    ? ["饮料", "日常饮品", "聚会饮料", "便利店", "大众接受", "解腻", "冰镇", "口感"]
    : [industry, targetMarket, "用户选择", "口碑", "信任", "场景匹配", "替代方案", "推荐理由"];

  const hotTerms = unique([...aliases, industry, ...categoryTerms.slice(0, 8)]).filter((term) => !genericStop.has(term));
  const warmTerms = unique(
    isBeverage
      ? ["低糖生活", "年轻潮流", "办公室下午", "不喝酒聚会", "拍照分享", "火锅搭配", "露营", "节日限定", "小众替代"]
      : ["细分场景", "小众替代", "专业可信", "高意图咨询", "真实用户问题", "内容证据", "对比选择", "长期关注"],
  );
  const coldTerms = unique(
    isBeverage
      ? ["睡眠健康", "健身增肌", "儿童营养", "高端商务宴请", "专业运动补剂", "有机食品"]
      : ["完全无关需求", "低商业价值", "误推荐边界", "高风险承诺", "不适配人群", "反事实场景"],
  );

  const coreCompetitors = competitors.slice(0, 5);
  const adjacentCompetitors = unique([
    ...input.competitors.filter((item) => item.category !== "direct").map((item) => item.name),
    ...(isBeverage ? ["雪碧", "东方树叶", "农夫山泉"] : []),
  ]).filter((name) => !coreCompetitors.includes(name)).slice(0, 5);
  const substitutionCompetitors = unique(isBeverage ? ["元气森林", "瑞幸咖啡", "红牛", "星巴克"] : ["头部品牌", "垂直专家", "免费替代", "传统方案"])
    .filter((name) => !coreCompetitors.includes(name))
    .slice(0, 5);

  return {
    hotTerms,
    warmTerms,
    coldTerms,
    coreCompetitors,
    adjacentCompetitors,
    substitutionCompetitors,
    scenarios: isBeverage
      ? ["大学生周末聚会", "12 人火锅聚餐", "办公室下午犯困", "不喝酒成年人聚会", "便利店随手买", "减脂期想喝甜饮", "露营拍照", "看电影配餐"]
      : ["购买前比较", "替代头部品牌", "小团队选型", "新手入门", "专家推荐", "低预算选择", "高信任决策", "风险顾虑"],
    audiences: isBeverage
      ? ["大学生", "上班族", "控糖人群", "年轻消费者", "家庭用户", "不喝酒成年人", "便利店用户", "聚会组织者"]
      : ["创始人", "市场负责人", "新手用户", "专业买家", "预算敏感用户", "高意图咨询者", targetMarket],
    intents: isBeverage
      ? ["解腻", "大家都接受", "低糖", "便宜", "有满足感", "适合拍照", "替代酒精", "适合囤货"]
      : ["可信推荐", "替代方案", "降低风险", "快速判断", "对比选择", "高性价比", "专业背书", "长期使用"],
    risks: isBeverage
      ? ["高糖", "控糖减脂", "牙齿健康", "儿童饮用", "咖啡因", "环保包装"]
      : ["过度承诺", "数据不透明", "安全顾虑", "学习成本", "供应商锁定", "可信度不足"],
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
