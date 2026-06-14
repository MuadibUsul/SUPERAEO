export type MarketingLocale = "zh-CN" | "en";

export type DemoNebulaTermType =
  | "POSITIVE"
  | "RISK"
  | "COMPETITOR"
  | "SCENARIO"
  | "OPPORTUNITY"
  | "MISSING";

export type DemoNebulaPolarity = "POSITIVE" | "NEGATIVE" | "NEUTRAL" | "MIXED";

export type DemoNebulaEvidence = {
  question: Record<MarketingLocale, string>;
  excerpt: Record<MarketingLocale, string>;
  provider: string;
  model: string;
  timestampLabel: string;
  explanation: Record<MarketingLocale, string>;
};

export type DemoNebulaNode = {
  id: string;
  term: Record<MarketingLocale, string>;
  termType: DemoNebulaTermType;
  polarity: DemoNebulaPolarity;
  semanticGravity: number;
  evidenceConfidence: number;
  observableAssociationStrength: number;
  coMentionStrength: number;
  angle: number;
  cluster: string;
  evidence: DemoNebulaEvidence[];
};

export const demoNebulaEntity = {
  id: "sample-challenger-beverage",
  name: {
    "zh-CN": "挑战者饮料",
    en: "Challenger Beverage",
  },
  label: {
    "zh-CN": "示例案例：挑战者饮料品牌",
    en: "Sample Case: Challenger Beverage Brand",
  },
};

function evidence(input: {
  questionZh: string;
  questionEn: string;
  excerptZh: string;
  excerptEn: string;
  explanationZh: string;
  explanationEn: string;
}): DemoNebulaEvidence {
  return {
    question: { "zh-CN": input.questionZh, en: input.questionEn },
    excerpt: { "zh-CN": input.excerptZh, en: input.excerptEn },
    provider: "Sample AI panel",
    model: "benchmark-mix",
    timestampLabel: "Demo run",
    explanation: { "zh-CN": input.explanationZh, en: input.explanationEn },
  };
}

export const demoNebulaNodes: DemoNebulaNode[] = [
  {
    id: "low-sugar",
    term: { "zh-CN": "低糖", en: "low-sugar" },
    termType: "POSITIVE",
    polarity: "POSITIVE",
    semanticGravity: 94,
    evidenceConfidence: 88,
    observableAssociationStrength: 94,
    coMentionStrength: 90,
    angle: -0.42,
    cluster: "benefit",
    evidence: [
      evidence({
        questionZh: "减脂期想喝可乐怎么办？",
        questionEn: "What should I drink when I want cola during fat loss?",
        excerptZh: "如果想保留可乐的满足感但控制糖分，可以优先考虑低糖气泡饮料。",
        excerptEn: "If you want the satisfying feel of cola while reducing sugar, low-sugar sparkling drinks are a good fit.",
        explanationZh: "低糖是推荐语境中最强的正向利益绑定。",
        explanationEn: "Low sugar is the strongest positive benefit association in recommendation contexts.",
      }),
    ],
  },
  {
    id: "sparkling",
    term: { "zh-CN": "气泡感", en: "sparkling feel" },
    termType: "POSITIVE",
    polarity: "POSITIVE",
    semanticGravity: 89,
    evidenceConfidence: 84,
    observableAssociationStrength: 88,
    coMentionStrength: 79,
    angle: -0.22,
    cluster: "benefit",
    evidence: [
      evidence({
        questionZh: "有哪些低糖但有气泡感的饮料？",
        questionEn: "What low-sugar drinks still have a sparkling feel?",
        excerptZh: "这类产品的优势在于气泡口感和清爽体验，比纯茶饮更接近快乐水。",
        excerptEn: "The advantage is the sparkling mouthfeel and crisp taste, closer to the soft-drink experience than plain tea.",
        explanationZh: "气泡感把实体从普通无糖饮料中区分出来。",
        explanationEn: "Sparkling feel differentiates the entity from generic sugar-free drinks.",
      }),
    ],
  },
  {
    id: "youth-lifestyle",
    term: { "zh-CN": "年轻生活方式", en: "youth lifestyle" },
    termType: "POSITIVE",
    polarity: "POSITIVE",
    semanticGravity: 76,
    evidenceConfidence: 72,
    observableAssociationStrength: 68,
    coMentionStrength: 62,
    angle: -0.72,
    cluster: "benefit",
    evidence: [
      evidence({
        questionZh: "适合露营拍照的小众饮料有哪些？",
        questionEn: "What niche drinks work well for camping photos?",
        excerptZh: "小众包装、露营和拍照场景，会让它更像一种年轻生活方式选择。",
        excerptEn: "Niche packaging, camping, and photo-friendly contexts make it feel like a youth lifestyle choice.",
        explanationZh: "AI 已经能把它放进生活方式语境，而不只是功能饮料。",
        explanationEn: "AI frames the brand as lifestyle-friendly, not only functional.",
      }),
    ],
  },
  {
    id: "satisfying-sweetness",
    term: { "zh-CN": "有满足感", en: "satisfying sweetness" },
    termType: "POSITIVE",
    polarity: "POSITIVE",
    semanticGravity: 73,
    evidenceConfidence: 67,
    observableAssociationStrength: 66,
    coMentionStrength: 58,
    angle: -0.98,
    cluster: "benefit",
    evidence: [
      evidence({
        questionZh: "想喝甜饮但怕胖怎么办？",
        questionEn: "What should I drink when I want something sweet but lighter?",
        excerptZh: "如果甜感足但热量压力低，它可以成为甜饮和控糖之间的折中选择。",
        excerptEn: "If it keeps a satisfying sweetness with lower calorie pressure, it can bridge cravings and sugar control.",
        explanationZh: "满足感是从控糖场景进入真实消费场景的桥。",
        explanationEn: "Taste satisfaction bridges health intent and real consumption.",
      }),
    ],
  },
  {
    id: "coca-cola",
    term: { "zh-CN": "可口可乐", en: "Coca-Cola" },
    termType: "COMPETITOR",
    polarity: "NEUTRAL",
    semanticGravity: 86,
    evidenceConfidence: 91,
    observableAssociationStrength: 84,
    coMentionStrength: 86,
    angle: 0.48,
    cluster: "competitor",
    evidence: [
      evidence({
        questionZh: "最值得推荐的碳酸饮料有哪些？",
        questionEn: "What carbonated drinks are most worth recommending?",
        excerptZh: "在主流碳酸饮料推荐里，可口可乐仍然是最稳定被提到的品牌。",
        excerptEn: "In mainstream carbonated-drink recommendations, Coca-Cola remains the most stable default mention.",
        explanationZh: "主流可乐问题仍由大品牌占据，是清晰竞品强区。",
        explanationEn: "Mainstream cola recommendations are still competitor-owned.",
      }),
    ],
  },
  {
    id: "pepsi",
    term: { "zh-CN": "百事", en: "Pepsi" },
    termType: "COMPETITOR",
    polarity: "NEUTRAL",
    semanticGravity: 78,
    evidenceConfidence: 84,
    observableAssociationStrength: 74,
    coMentionStrength: 72,
    angle: 0.7,
    cluster: "competitor",
    evidence: [
      evidence({
        questionZh: "最值得推荐的碳酸饮料有哪些？",
        questionEn: "What carbonated drinks are most worth recommending?",
        excerptZh: "百事经常作为经典可乐选项出现，尤其是在泛化推荐问题中。",
        excerptEn: "Pepsi often appears as a classic cola option, especially in broad recommendation questions.",
        explanationZh: "泛化推荐中，经典品牌会天然拿到默认槽位。",
        explanationEn: "Classic brands naturally receive default slots in broad prompts.",
      }),
    ],
  },
  {
    id: "genki-forest",
    term: { "zh-CN": "元气森林", en: "Genki Forest" },
    termType: "COMPETITOR",
    polarity: "NEUTRAL",
    semanticGravity: 82,
    evidenceConfidence: 83,
    observableAssociationStrength: 79,
    coMentionStrength: 80,
    angle: 0.92,
    cluster: "competitor",
    evidence: [
      evidence({
        questionZh: "有哪些低糖但有气泡感的饮料？",
        questionEn: "What low-sugar drinks still have a sparkling feel?",
        excerptZh: "谈到低糖气泡水时，元气森林已经拥有较强的语义位置。",
        excerptEn: "When answers discuss low-sugar sparkling drinks, Genki Forest already owns a strong semantic position.",
        explanationZh: "低糖气泡这个语义位置已有强竞品，需要差异化场景。",
        explanationEn: "The low-sugar sparkling position already has a strong competitor.",
      }),
    ],
  },
  {
    id: "niche-only",
    term: { "zh-CN": "小众限制", en: "niche only" },
    termType: "RISK",
    polarity: "NEGATIVE",
    semanticGravity: 68,
    evidenceConfidence: 74,
    observableAssociationStrength: 63,
    coMentionStrength: 56,
    angle: 1.34,
    cluster: "risk",
    evidence: [
      evidence({
        questionZh: "有哪些小众气泡饮料品牌值得关注？",
        questionEn: "Which niche sparkling beverage brands are worth watching?",
        excerptZh: "AI 会把它描述成有趣的小众选择，但还不是大众默认答案。",
        excerptEn: "AI frames it as an interesting niche option, but not yet a mainstream default.",
        explanationZh: "小众定位有吸引力，也会限制主流推荐进入率。",
        explanationEn: "Niche positioning is attractive but can limit mainstream inclusion.",
      }),
    ],
  },
  {
    id: "low-awareness",
    term: { "zh-CN": "认知度不足", en: "low awareness" },
    termType: "RISK",
    polarity: "NEGATIVE",
    semanticGravity: 64,
    evidenceConfidence: 70,
    observableAssociationStrength: 58,
    coMentionStrength: 52,
    angle: 1.58,
    cluster: "risk",
    evidence: [
      evidence({
        questionZh: "有哪些小众气泡饮料品牌值得关注？",
        questionEn: "Which niche sparkling beverage brands are worth watching?",
        excerptZh: "如果问题没有限定低糖或气泡场景，品牌被主动召回的概率较低。",
        excerptEn: "Without a low-sugar or sparkling-drink constraint, the brand is less likely to be recalled.",
        explanationZh: "缺少场景限定时，品牌召回仍弱。",
        explanationEn: "Brand recall is weak without scenario constraints.",
      }),
    ],
  },
  {
    id: "overclaiming",
    term: { "zh-CN": "功效过度承诺", en: "overclaiming risk" },
    termType: "RISK",
    polarity: "NEGATIVE",
    semanticGravity: 54,
    evidenceConfidence: 62,
    observableAssociationStrength: 48,
    coMentionStrength: 44,
    angle: 1.86,
    cluster: "risk",
    evidence: [
      evidence({
        questionZh: "低糖气泡饮料是否更健康？",
        questionEn: "Are low-sugar sparkling drinks healthier?",
        excerptZh: "健康相关表述需要更谨慎，不能把低糖直接等同于健康效果。",
        excerptEn: "Health framing needs care; low sugar should not be treated as a broad health claim.",
        explanationZh: "健康叙事需要证据边界，避免错误关联风险。",
        explanationEn: "Health claims need evidence boundaries.",
      }),
    ],
  },
  {
    id: "fat-loss-drink",
    term: { "zh-CN": "减脂期饮料", en: "fat-loss drink" },
    termType: "SCENARIO",
    polarity: "POSITIVE",
    semanticGravity: 85,
    evidenceConfidence: 79,
    observableAssociationStrength: 83,
    coMentionStrength: 77,
    angle: -1.52,
    cluster: "scenario",
    evidence: [
      evidence({
        questionZh: "减脂期想喝可乐怎么办？",
        questionEn: "What should I drink when I want cola during fat loss?",
        excerptZh: "减脂期饮料替代是一个明确场景，AI 倾向于列出具体饮品。",
        excerptEn: "Fat-loss beverage substitution is a clear scenario where AI tends to list specific drinks.",
        explanationZh: "减脂替代是高意图长尾场景。",
        explanationEn: "Fat-loss substitution is a high-intent long-tail scenario.",
      }),
    ],
  },
  {
    id: "non-alcoholic-gathering",
    term: { "zh-CN": "不喝酒聚会", en: "non-alcoholic gathering" },
    termType: "SCENARIO",
    polarity: "POSITIVE",
    semanticGravity: 80,
    evidenceConfidence: 74,
    observableAssociationStrength: 76,
    coMentionStrength: 68,
    angle: -1.86,
    cluster: "scenario",
    evidence: [
      evidence({
        questionZh: "不喝酒的人聚会喝什么？",
        questionEn: "What should people drink at a party if they do not drink alcohol?",
        excerptZh: "非酒精聚会问题会触发具体饮料推荐，而不是只有泛泛建议。",
        excerptEn: "Non-alcoholic gathering prompts trigger concrete beverage recommendations rather than only general advice.",
        explanationZh: "社交场景能把饮品从功能利益带到生活场景。",
        explanationEn: "The social context makes the entity more recommendable.",
      }),
    ],
  },
  {
    id: "office-afternoon",
    term: { "zh-CN": "办公室下午", en: "office afternoon" },
    termType: "SCENARIO",
    polarity: "POSITIVE",
    semanticGravity: 74,
    evidenceConfidence: 68,
    observableAssociationStrength: 66,
    coMentionStrength: 60,
    angle: -2.18,
    cluster: "scenario",
    evidence: [
      evidence({
        questionZh: "办公室下午困但不想喝咖啡喝什么？",
        questionEn: "What can I drink in the office afternoon if I do not want coffee?",
        excerptZh: "办公室下午场景连接了清爽、低负担和囤货需求。",
        excerptEn: "Office-afternoon prompts connect refreshment, lighter choices, and pantry stocking intent.",
        explanationZh: "这是内容可建设、购买价值清晰的场景。",
        explanationEn: "This scenario has clear content and purchase value.",
      }),
    ],
  },
  {
    id: "camping-photo",
    term: { "zh-CN": "露营拍照", en: "camping photos" },
    termType: "SCENARIO",
    polarity: "POSITIVE",
    semanticGravity: 60,
    evidenceConfidence: 58,
    observableAssociationStrength: 50,
    coMentionStrength: 42,
    angle: -2.48,
    cluster: "scenario",
    evidence: [
      evidence({
        questionZh: "适合露营拍照的小众饮料有哪些？",
        questionEn: "What niche drinks work well for camping photos?",
        excerptZh: "露营拍照场景更强调包装、颜色和社交传播，而不是单纯口味。",
        excerptEn: "Camping-photo prompts emphasize packaging, color, and social sharing more than taste alone.",
        explanationZh: "露营拍照提供差异化生活方式入口。",
        explanationEn: "Camping photos create a lifestyle entry point.",
      }),
    ],
  },
  {
    id: "cola-during-fat-loss",
    term: { "zh-CN": "减脂期想喝可乐", en: "cola during fat loss" },
    termType: "OPPORTUNITY",
    polarity: "POSITIVE",
    semanticGravity: 89,
    evidenceConfidence: 76,
    observableAssociationStrength: 86,
    coMentionStrength: 78,
    angle: 2.72,
    cluster: "opportunity",
    evidence: [
      evidence({
        questionZh: "减脂期想喝可乐怎么办？",
        questionEn: "What should I drink when I want cola during fat loss?",
        excerptZh: "这个问题有高意图、弱固定赢家，并且和低糖气泡饮料高度匹配。",
        excerptEn: "This question has high intent, a weak fixed winner, and strong fit for low-sugar sparkling drinks.",
        explanationZh: "这是高意图、弱固定赢家的可抢占问题。",
        explanationEn: "This is a high-intent long-tail opportunity.",
      }),
    ],
  },
  {
    id: "party-without-alcohol",
    term: { "zh-CN": "不喝酒聚会喝什么", en: "party drinks without alcohol" },
    termType: "OPPORTUNITY",
    polarity: "POSITIVE",
    semanticGravity: 83,
    evidenceConfidence: 70,
    observableAssociationStrength: 80,
    coMentionStrength: 66,
    angle: 2.42,
    cluster: "opportunity",
    evidence: [
      evidence({
        questionZh: "不喝酒的人聚会喝什么？",
        questionEn: "What should people drink at a party if they do not drink alcohol?",
        excerptZh: "社交场景明确，适合建立非酒精聚会饮品内容证据。",
        excerptEn: "The social scenario is clear and suitable for building non-alcoholic gathering evidence.",
        explanationZh: "该场景容易触发推荐列表，适合内容建设。",
        explanationEn: "The question invites concrete recommendations and scenario ownership.",
      }),
    ],
  },
  {
    id: "office-no-coffee",
    term: { "zh-CN": "下午困但不喝咖啡", en: "office drink instead of coffee" },
    termType: "OPPORTUNITY",
    polarity: "POSITIVE",
    semanticGravity: 75,
    evidenceConfidence: 68,
    observableAssociationStrength: 68,
    coMentionStrength: 58,
    angle: 2.1,
    cluster: "opportunity",
    evidence: [
      evidence({
        questionZh: "办公室下午困但不想喝咖啡喝什么？",
        questionEn: "What can I drink in the office afternoon if I do not want coffee?",
        excerptZh: "这是一个真实口语问题，能连接场景、功能和购买。",
        excerptEn: "This is a natural question that connects functional benefit with purchase context.",
        explanationZh: "可避开咖啡竞争，进入清爽替代推荐空间。",
        explanationEn: "The entity can enter by avoiding direct coffee competition.",
      }),
    ],
  },
  {
    id: "category-alternative",
    term: { "zh-CN": "大牌替代", en: "alternative to big brands" },
    termType: "OPPORTUNITY",
    polarity: "POSITIVE",
    semanticGravity: 72,
    evidenceConfidence: 64,
    observableAssociationStrength: 62,
    coMentionStrength: 54,
    angle: 2.88,
    cluster: "opportunity",
    evidence: [
      evidence({
        questionZh: "不想喝可口可乐和百事，有什么小众替代？",
        questionEn: "What niche alternatives are there to Coca-Cola and Pepsi?",
        excerptZh: "当用户明确不想选大牌时，挑战者品牌更容易进入推荐列表。",
        excerptEn: "When users explicitly avoid big brands, challenger brands are more likely to enter recommendation lists.",
        explanationZh: "明确反大牌问题会降低竞争门槛。",
        explanationEn: "Alternative-to-big-brand prompts lower the competition threshold.",
      }),
    ],
  },
  {
    id: "trusted-daily-alternative",
    term: { "zh-CN": "日常可信替代", en: "trusted daily alternative" },
    termType: "MISSING",
    polarity: "NEUTRAL",
    semanticGravity: 66,
    evidenceConfidence: 42,
    observableAssociationStrength: 52,
    coMentionStrength: 38,
    angle: 3.66,
    cluster: "missing",
    evidence: [
      evidence({
        questionZh: "有没有可以日常替代快乐水的饮料？",
        questionEn: "Is there a daily alternative to cola-style soft drinks?",
        excerptZh: "日常可信替代仍然是理想关联，但回答证据还不稳定。",
        excerptEn: "Trusted daily alternative remains a desired association, but evidence is not stable yet.",
        explanationZh: "理想语义尚未稳定，需要证据建设。",
        explanationEn: "The desired association is valuable but not yet stable.",
      }),
    ],
  },
  {
    id: "mainstream-refreshment",
    term: { "zh-CN": "主流清爽饮品", en: "mainstream refreshment" },
    termType: "MISSING",
    polarity: "NEUTRAL",
    semanticGravity: 62,
    evidenceConfidence: 38,
    observableAssociationStrength: 48,
    coMentionStrength: 35,
    angle: 3.88,
    cluster: "missing",
    evidence: [
      evidence({
        questionZh: "最值得推荐的碳酸饮料有哪些？",
        questionEn: "What carbonated drinks are most worth recommending?",
        excerptZh: "AI 尚未把它作为主流清爽饮品默认选项。",
        excerptEn: "AI does not yet treat it as a mainstream refreshment default.",
        explanationZh: "主流清爽饮品位置还没有被目标实体占据。",
        explanationEn: "The mainstream refreshment position is not owned yet.",
      }),
    ],
  },
  {
    id: "convenience-store-default",
    term: { "zh-CN": "便利店默认选择", en: "convenience-store default" },
    termType: "MISSING",
    polarity: "NEUTRAL",
    semanticGravity: 50,
    evidenceConfidence: 34,
    observableAssociationStrength: 40,
    coMentionStrength: 28,
    angle: 4.08,
    cluster: "missing",
    evidence: [
      evidence({
        questionZh: "有没有可以日常替代快乐水的饮料？",
        questionEn: "Is there a daily alternative to cola-style soft drinks?",
        excerptZh: "便利店购买场景对可得性和价格证据要求更高。",
        excerptEn: "Convenience-store scenarios require stronger availability and price evidence.",
        explanationZh: "便利店默认选择还缺少可得性证据。",
        explanationEn: "Convenience-store default status needs availability evidence.",
      }),
    ],
  },
  {
    id: "taste-proof",
    term: { "zh-CN": "口味证明", en: "taste proof" },
    termType: "MISSING",
    polarity: "NEUTRAL",
    semanticGravity: 55,
    evidenceConfidence: 40,
    observableAssociationStrength: 43,
    coMentionStrength: 34,
    angle: 4.48,
    cluster: "missing",
    evidence: [
      evidence({
        questionZh: "想喝甜饮但怕胖怎么办？",
        questionEn: "What should I drink when I want something sweet but lighter?",
        excerptZh: "回答倾向于要求口味测评、配料和用户评价来支撑口感判断。",
        excerptEn: "Answers tend to ask for taste reviews, ingredients, and user feedback to support taste claims.",
        explanationZh: "口味证明不足会削弱推荐理由所有权。",
        explanationEn: "Taste proof is a key missing evidence layer.",
      }),
    ],
  },
];
