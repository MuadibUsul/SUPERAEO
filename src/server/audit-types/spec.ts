import type { SubjectEntityType } from "@/generated/prisma/client";

import { getEntityProfile } from "@/server/entity/entity-profiles";

/**
 * One spec per audit type, covering only the parts of the pipeline that were
 * NOT already differentiated: required inputs and seed vocabulary.
 *
 * Deliberately not restated here, because each already branches per type and a
 * second copy would drift:
 *   - probe prompt wording      -> probe-templates.ts
 *   - nebula ontology weights   -> semantic-nebula/ontology.ts
 *   - accuracy metrics          -> metrics/cip-metrics.ts
 *   - primary metric, top risk,
 *     verdict lead, comparison
 *     kind                      -> entity/entity-profiles.ts
 *
 * This replaces src/server/probe/registry.ts, which declared probe families,
 * metrics and workflow steps for all four types and was never read by anything.
 */

export type ComparisonKind = "competitor" | "peer" | "source" | "substitute";

/**
 * Fallback seed vocabulary, used to fill probe template slots when the project
 * has no AI-generated SemanticKeywords of that kind yet.
 *
 * Project-derived keywords always take precedence. These exist so that a fresh
 * project still produces type-appropriate probes instead of falling back to the
 * B2B-procurement vocabulary that every non-beverage project used to get.
 */
export type SeedVocabulary = {
  scenarios: string[];
  audiences: string[];
  intents: string[];
  risks: string[];
  /** Semantically distant terms — used to detect over-broad recommendation. */
  coldTerms: string[];
  /** Adjacent opportunity space. */
  warmTerms: string[];
  /** Category-level terms describing the subject's space. */
  categoryTerms: string[];
  /**
   * Generic stand-ins for comparison targets, used when the customer declared
   * few or none. These are descriptors ("the leading brand"), never named
   * entities — naming an entity the customer never mentioned put invented
   * competitors into their report.
   */
  comparisonDescriptors: string[];
};

export type RequiredInput = {
  /** Field on the normalized project input. */
  field: "subjectName" | "category" | "market" | "websiteUrl" | "desiredUnderstanding";
  /** Message shown when it is missing. */
  message: { zh: string; en: string };
  /** Extra check beyond "is non-empty". */
  validate?: (value: string) => boolean;
};

export type AuditTypeSpec = {
  entityType: SubjectEntityType;
  comparisonKind: ComparisonKind;
  requiredInputs: RequiredInput[];
  seedVocabulary: { zh: SeedVocabulary; en: SeedVocabulary };
};

function isHttpUrl(value: string) {
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return Boolean(url.hostname) && url.hostname.includes(".");
  } catch {
    return false;
  }
}

export const auditTypeSpecs: Record<SubjectEntityType, AuditTypeSpec> = {
  BRAND: {
    entityType: "BRAND",
    comparisonKind: "competitor",
    requiredInputs: [
      { field: "subjectName", message: { zh: "请填写品牌名称。", en: "Brand name is required." } },
      { field: "category", message: { zh: "请填写品类，否则无法判断竞争范围。", en: "Category is required to scope the competitive set." } },
      { field: "market", message: { zh: "请填写目标市场。", en: "Target market is required." } },
    ],
    seedVocabulary: {
      zh: {
        scenarios: ["日常使用", "送礼选择", "多人聚会", "第一次尝试", "复购决策", "替换现有品牌", "预算有限时", "看重品质时", "临时应急购买", "囤货补货", "特殊场合", "与他人共同使用", "长期固定选择", "尝鲜求新", "被他人推荐后"],
        audiences: ["普通消费者", "初次购买者", "老用户", "价格敏感人群", "品质敏感人群", "礼品购买者", "年轻消费者", "家庭用户", "重度使用者", "犹豫观望者", "从竞品转来的用户", "专业挑剔用户"],
        intents: ["值得信任", "性价比高", "口碑好", "适合场景", "有辨识度", "无踩雷风险", "买得到", "用着省心", "符合身份", "品质稳定", "有情感认同", "别人也在用"],
        risks: ["负面口碑", "过度宣传", "品质不稳定", "不适合特定人群", "定位模糊", "价格争议", "服务问题", "与竞品混淆"],
        coldTerms: ["完全无关需求", "错误人群", "误推荐边界", "反事实场景", "超出品类范围"],
        warmTerms: ["细分场景", "小众替代", "新兴需求", "跨品类联想", "潜在人群", "未被占据的联想"],
        categoryTerms: ["品类归属", "使用场景", "目标人群", "核心卖点", "口碑", "信任"],
        comparisonDescriptors: ["同品类头部品牌", "高性价比替代", "小众专精品牌", "传统老牌"],
      },
      en: {
        scenarios: ["everyday use", "buying a gift", "a group gathering", "trying it the first time", "deciding to rebuy", "replacing the current brand", "on a tight budget", "when quality matters most", "an urgent unplanned purchase", "stocking up", "a special occasion", "sharing it with others", "a long-standing default choice", "wanting to try something new", "after someone recommended it"],
        audiences: ["ordinary consumers", "first-time buyers", "existing customers", "price-sensitive shoppers", "quality-focused shoppers", "gift buyers", "younger consumers", "family shoppers", "heavy users", "people still undecided", "switchers from a competitor", "demanding expert users"],
        intents: ["trustworthy", "good value", "well reviewed", "fits the occasion", "distinctive", "a safe bet", "easy to actually find", "hassle-free to use", "fits how they see themselves", "consistent quality", "something they identify with", "what other people use"],
        risks: ["negative word of mouth", "overpromising", "inconsistent quality", "wrong for certain people", "unclear positioning", "price controversy", "service problems", "confused with a competitor"],
        coldTerms: ["unrelated need", "wrong audience", "mis-recommendation boundary", "counterfactual scenario", "outside the category"],
        warmTerms: ["niche scenario", "niche alternative", "emerging need", "cross-category association", "an audience not yet reached", "an association nobody owns"],
        categoryTerms: ["category membership", "use occasion", "target audience", "core selling point", "reputation", "trust"],
        comparisonDescriptors: ["the category leader", "a value alternative", "a niche specialist brand", "a long-established incumbent"],
      },
    },
  },

  PERSON: {
    entityType: "PERSON",
    comparisonKind: "peer",
    requiredInputs: [
      { field: "subjectName", message: { zh: "请填写姓名。", en: "Name is required." } },
      { field: "category", message: { zh: "请填写专业领域或身份，否则无法与同名者区分。", en: "A field or role is required, otherwise same-name people cannot be told apart." } },
    ],
    seedVocabulary: {
      zh: {
        // No purchase, renewal or procurement language: a person audit asks who
        // AI thinks this is and whether it has the facts right.
        scenarios: ["寻找领域专家", "查证某项事实", "邀请演讲或访谈", "引用其观点", "了解代表作品", "确认任职经历", "区分同名人物", "撰写人物介绍", "评估学术或行业影响力", "寻找可信的第三方观点", "核对头衔与资历", "追溯某个观点的出处", "了解近期动向", "寻找合作或推荐人选", "判断是否值得引用"],
        audiences: ["记者", "研究者", "学生", "同行从业者", "会议组织者", "招聘方", "编辑", "投资人", "政策制定者", "传记作者", "播客主持人", "行业分析师"],
        intents: ["确认身份", "核实履历", "找到权威来源", "了解专业观点", "判断可引用性", "确认代表作", "厘清与同名者的区别", "了解影响力范围", "获得准确头衔", "确认时间线", "找到原始出处", "评估专业深度"],
        risks: ["事实错误", "同名混淆", "过时信息", "夸大成就", "错误归属作品", "机构关系有误", "时间线错误", "凭空生成的荣誉"],
        coldTerms: ["无关领域", "错误身份", "凭空捏造的成就", "不存在的机构", "另一个同名者的经历"],
        warmTerms: ["新兴研究方向", "跨领域影响", "近期动态", "合作网络", "尚未被认知的贡献", "被低估的领域"],
        categoryTerms: ["专业领域", "职位", "所属机构", "代表作品", "学术或行业身份"],
        comparisonDescriptors: ["该领域公认权威", "同代同行研究者", "更常被引用的作者", "相邻领域专家"],
      },
      en: {
        scenarios: ["finding an expert in the field", "verifying a specific fact", "inviting a speaker or interviewee", "citing their view", "learning their notable work", "confirming a role or tenure", "telling apart same-name people", "writing a profile of them", "assessing academic or industry influence", "looking for a credible third-party view", "checking titles and credentials", "tracing where a claim originated", "catching up on recent activity", "finding a collaborator or referee", "judging whether they are worth citing"],
        audiences: ["journalists", "researchers", "students", "peers in the field", "conference organizers", "recruiters", "editors", "investors", "policy makers", "biographers", "podcast hosts", "industry analysts"],
        intents: ["confirm identity", "verify a biography", "find an authoritative source", "understand their expert view", "judge citation-worthiness", "confirm notable work", "separate them from same-name people", "gauge their reach", "get the title right", "confirm the timeline", "find the original source", "assess depth of expertise"],
        risks: ["factual error", "same-name confusion", "outdated information", "overstated achievement", "misattributed work", "wrong affiliation", "wrong timeline", "an invented honour"],
        coldTerms: ["unrelated field", "wrong identity", "fabricated achievement", "nonexistent institution", "another same-name person's history"],
        warmTerms: ["emerging research direction", "cross-disciplinary influence", "recent activity", "collaboration network", "an unrecognized contribution", "an underrated area"],
        categoryTerms: ["field of expertise", "role", "affiliation", "notable work", "academic or industry standing"],
        comparisonDescriptors: ["a recognized authority in the field", "a peer of the same generation", "a more frequently cited author", "an expert in an adjacent field"],
      },
    },
  },

  WEBSITE: {
    entityType: "WEBSITE",
    comparisonKind: "source",
    requiredInputs: [
      { field: "subjectName", message: { zh: "请填写网站名称。", en: "Site name is required." } },
      {
        field: "websiteUrl",
        message: { zh: "请填写有效的网站地址。", en: "A valid site URL is required." },
        validate: isHttpUrl,
      },
      { field: "category", message: { zh: "请填写网站类型或主题领域。", en: "Site type or topic area is required." } },
    ],
    seedVocabulary: {
      zh: {
        // A website audit asks which questions AI answers using this site —
        // not who buys it.
        scenarios: ["查找权威解释", "对比多个信息源", "验证一个说法", "寻找操作指南", "了解最新进展", "查找数据出处", "寻找入门材料", "查找专业深度内容", "需要可引用的出处", "查找定义与术语", "寻找案例或实例", "核对统计数字", "查找官方口径", "解决具体报错或问题", "寻找不同观点"],
        audiences: ["搜索答案的用户", "研究者", "从业者", "内容编辑", "初学者", "需要出处的人", "记者", "学生", "分析师", "教师", "产品经理", "决策者"],
        intents: ["找到可信答案", "确认信息出处", "获得完整解释", "找到最新数据", "判断来源可信度", "找到可直接引用的段落", "了解全貌", "快速上手", "验证他处说法", "找到权威定义", "获取一手资料", "对比不同说法"],
        risks: ["来源不可信", "内容陈旧", "缺少作者署名", "无法验证", "内容浅显", "与权威来源冲突", "缺少发布时间", "无结构化数据"],
        coldTerms: ["无关主题", "不该被引用的场合", "超出网站范围的问题", "更该问官方机构的问题"],
        warmTerms: ["未覆盖的相关问题", "邻近主题", "长尾提问", "延伸阅读需求", "竞争来源已占据的问题", "尚无优质答案的问题"],
        categoryTerms: ["主题领域", "内容类型", "覆盖问题", "引用价值", "权威性"],
        comparisonDescriptors: ["官方或机构网站", "维基类百科来源", "该主题的头部媒体", "垂直专业社区"],
      },
      en: {
        scenarios: ["looking for an authoritative explanation", "comparing several sources", "verifying a claim", "looking for a how-to", "checking recent developments", "tracing where data came from", "finding introductory material", "looking for in-depth expert content", "needing a citable source", "looking up a definition or term", "finding worked examples", "checking a statistic", "finding the official position", "troubleshooting a specific error", "seeking a dissenting view"],
        audiences: ["people searching for an answer", "researchers", "practitioners", "content editors", "beginners", "people who need a citation", "journalists", "students", "analysts", "teachers", "product managers", "decision makers"],
        intents: ["find a trustworthy answer", "confirm the source", "get a complete explanation", "find current data", "judge source credibility", "find a directly quotable passage", "get the full picture", "get started quickly", "verify a claim seen elsewhere", "find an authoritative definition", "get primary material", "compare conflicting accounts"],
        risks: ["untrustworthy source", "stale content", "no named author", "unverifiable", "shallow coverage", "conflicts with authoritative sources", "no publication date", "no structured data"],
        coldTerms: ["unrelated topic", "context where it should not be cited", "questions outside the site's scope", "questions better asked of an official body"],
        warmTerms: ["related question not yet covered", "adjacent topic", "long-tail question", "follow-up reading need", "a question a rival source already owns", "a question with no good answer yet"],
        categoryTerms: ["topic area", "content type", "questions covered", "citation value", "authority"],
        comparisonDescriptors: ["an official or institutional site", "an encyclopedia-style source", "a leading publication on the topic", "a specialist community site"],
      },
    },
  },

  PRODUCT: {
    entityType: "PRODUCT",
    comparisonKind: "substitute",
    requiredInputs: [
      { field: "subjectName", message: { zh: "请填写产品名称。", en: "Product name is required." } },
      { field: "category", message: { zh: "请填写产品类别。", en: "Product category is required." } },
      {
        field: "desiredUnderstanding",
        message: {
          zh: "请至少填写一项核心功能、规格或使用场景，否则无法核查参数错误。",
          en: "Describe at least one core feature, spec or use case — parameter errors cannot be checked without it.",
        },
      },
    ],
    seedVocabulary: {
      zh: {
        scenarios: ["解决具体任务", "选型对比", "升级替换", "首次接触该品类", "特定环境下使用", "预算受限时选择", "长期使用考量", "与现有设备或系统配合", "高强度使用", "偶尔轻度使用", "专业场景要求", "需要特定规格时", "关注售后与耐用性", "多人共用", "移动或户外使用"],
        audiences: ["目标用户", "专业使用者", "初学者", "技术评估者", "预算敏感用户", "重度使用者", "小型团队", "家庭用户", "从竞品迁移的用户", "对规格敏感的用户", "追求性价比的用户", "首次购买该品类的人"],
        intents: ["满足功能需求", "参数达标", "易于上手", "兼容现有方案", "长期可靠", "价格合理", "维护成本低", "扩展性好", "满足特定规格", "不踩已知的坑", "售后有保障", "上手时间短"],
        risks: ["功能被说错", "参数被说错", "限制未被提及", "兼容性误导", "适用人群错误", "夸大能力", "型号或版本混淆", "已停产却仍被推荐"],
        coldTerms: ["不支持的用途", "错误的使用环境", "超出产品能力的任务", "另一品类才能解决的需求"],
        warmTerms: ["未被认知的功能", "潜在使用场景", "邻近品类替代", "组合使用", "被忽略的规格优势", "尚未被提及的适用人群"],
        categoryTerms: ["产品类别", "核心功能", "关键规格", "适用场景", "目标用户", "已知限制"],
        comparisonDescriptors: ["同类畅销产品", "更低价位替代", "专业级替代", "上一代或经典型号"],
      },
      en: {
        scenarios: ["solving a specific task", "evaluating options", "upgrading or replacing", "first exposure to the category", "use in a particular environment", "choosing on a limited budget", "considering long-term use", "working alongside existing kit or systems", "heavy sustained use", "occasional light use", "a professional requirement", "when a specific spec is mandatory", "caring about support and durability", "shared by several people", "mobile or outdoor use"],
        audiences: ["target users", "professional users", "beginners", "technical evaluators", "budget-sensitive users", "heavy users", "small teams", "household users", "people migrating from a competitor", "spec-sensitive buyers", "value-focused buyers", "first-time buyers in the category"],
        intents: ["meets the functional need", "specs are sufficient", "easy to get started", "compatible with what they have", "reliable long term", "reasonably priced", "low maintenance cost", "room to grow into", "meets a specific spec", "avoids the known pitfalls", "backed by real support", "quick to learn"],
        risks: ["a feature stated wrongly", "a spec stated wrongly", "a limitation left unmentioned", "misleading compatibility", "wrong target user", "overstated capability", "model or version confusion", "recommended despite being discontinued"],
        coldTerms: ["unsupported use", "wrong operating environment", "task beyond the product's capability", "a need only another category solves"],
        warmTerms: ["capability not yet recognized", "potential use case", "adjacent-category substitute", "used in combination", "an overlooked spec advantage", "an audience nobody mentions"],
        categoryTerms: ["product category", "core features", "key specs", "applicable scenarios", "target users", "known limitations"],
        comparisonDescriptors: ["a best-selling product in the category", "a cheaper alternative", "a professional-grade alternative", "a previous-generation or classic model"],
      },
    },
  },
};

export function getAuditTypeSpec(entityType: SubjectEntityType): AuditTypeSpec {
  return auditTypeSpecs[entityType];
}

export function seedVocabularyFor(entityType: SubjectEntityType, language: string): SeedVocabulary {
  const spec = getAuditTypeSpec(entityType);
  return language.toLowerCase().startsWith("zh") ? spec.seedVocabulary.zh : spec.seedVocabulary.en;
}

/**
 * The Competitor.category value this audit type's comparison targets get.
 *
 * Read from the entity profile rather than restated here: that module already
 * owns the report-facing view of each type (primary metrics, top risk, verdict
 * lead) and defines competitorKind alongside them. Two copies of "what does a
 * comparison mean for a PERSON" is how they drift apart.
 */
export function comparisonCategoryFor(entityType: SubjectEntityType) {
  return getEntityProfile(entityType).competitorKind;
}
