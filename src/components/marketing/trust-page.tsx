import Link from "next/link";
import { SiteHeader } from "@/components/layout/site-header";
import type { Locale } from "@/i18n/config";

type Kind = "methodology" | "security" | "privacy" | "changelog" | "benchmarks" | "case-studies";

const content: Record<Kind, Record<Locale, { title: string; intro: string; sections: Array<{ title: string; body: string }> }>> = {
  methodology: {
    "zh-CN": { title: "方法论与限制", intro: "CIP 观察指定模型在指定问题、参数和时间下的抽样回答；它不读取模型内部状态，也不把单次回答当作事实。", sections: [
      { title: "证据等级", body: "少于20条样本为证据不足；达到门槛后仍需区分单模型方向性证据与多模型交叉支持。每个分数展示样本量、区间和方法版本。" },
      { title: "事实与来源", body: "链接可达只表示来源存在。来源类别和机器判断不等于独立事实认证；关键事实应回到一手资料或人工复核。" },
      { title: "准实验", body: "处理/对照结果使用问题级聚合、分层随机分组和差分估计。未预注册、未达功效或配置发生变化时只报告方向性结果。" },
      { title: "已知限制", body: "模型输出具有随机性，并受模型版本、地区、时间、提示语和供应商策略影响；任何报告都是有时间边界的抽样快照。" },
    ] },
    en: { title: "Methodology and limitations", intro: "CIP observes sampled answers from specified models, questions, settings, and times. It does not inspect hidden model state or treat one answer as fact.", sections: [
      { title: "Evidence grades", body: "Fewer than 20 answers is insufficient evidence. Above that threshold, single-model directional evidence remains distinct from multi-model corroboration. Scores show sample size, intervals, and method version." },
      { title: "Facts and sources", body: "A reachable link proves only that a source exists. Source class and machine-assessed support are not independent certification of truth." },
      { title: "Quasi-experiments", body: "Treatment/control results use question-level aggregation, seeded stratified assignment, and difference estimates. Underpowered or non-preregistered work remains directional." },
      { title: "Known limits", body: "Outputs vary with model version, geography, time, prompts, and provider policy. Every report is a time-bounded sample." },
    ] },
  },
  security: {
    "zh-CN": { title: "安全说明", intro: "安全声明仅描述本产品实现的控制，不声称已获得 SOC 2 或 ISO 认证。", sections: [{ title: "访问控制", body: "客户数据按组织和项目隔离；私有证据接口需要有效会话，公开分享使用不可猜测、可撤销、限时令牌。" }, { title: "密钥与完整性", body: "Provider 密钥加密保存。公开报告使用 Ed25519 签名和 SHA-256 清单哈希，签名私钥来自部署密钥系统。" }, { title: "外部抓取", body: "来源核验限制协议、重定向、响应大小和超时，并阻止私网、环回、链路本地与云元数据地址。" }] },
    en: { title: "Security", intro: "These controls describe the product implementation. CIP does not claim SOC 2 or ISO certification.", sections: [{ title: "Access control", body: "Customer data is scoped by organization and project. Private evidence requires a session; public shares use unguessable, revocable, time-limited tokens." }, { title: "Keys and integrity", body: "Provider credentials are encrypted. Public reports use Ed25519 signatures and SHA-256 manifest hashes." }, { title: "Outbound verification", body: "Source checks restrict protocols, redirects, size, and time while blocking private, loopback, link-local, and cloud metadata addresses." }] },
  },
  privacy: {
    "zh-CN": { title: "隐私与数据保留", intro: "运行审计会把用户提供的问题和必要上下文发送给配置的模型供应商。", sections: [{ title: "默认保留", body: "原始回答与来源快照保留180天，审计日志保留365天，报告和派生快照保留至项目删除。" }, { title: "删除", body: "项目删除后立即停止访问，并在30天内完成主存储删除；备份按7天生命周期淘汰。" }, { title: "公开分享", body: "公开验证页只包含脱敏摘要和完整性数据，不公开完整 prompt、客户上下文、完整回答或网页快照。" }] },
    en: { title: "Privacy and retention", intro: "Running an audit sends submitted questions and necessary context to configured model providers.", sections: [{ title: "Default retention", body: "Raw answers and source snapshots are retained for 180 days, audit logs for 365 days, and reports until project deletion." }, { title: "Deletion", body: "Access stops immediately after project deletion; primary storage is removed within 30 days and backups expire after 7 days." }, { title: "Public sharing", body: "Verification pages expose a redacted manifest, not full prompts, customer context, full answers, or archived pages." }] },
  },
  changelog: {
    "zh-CN": { title: "方法变更记录", intro: "影响指标解释、证据等级或实验结论的变更会在这里公开。", sections: [{ title: "2026-09-09 · Evidence v1", body: "新增结构化证据链、样本门槛、来源快照、签名验证和准实验限制；历史报告标记为证据不完整。" }] },
    en: { title: "Method changelog", intro: "Changes that affect metrics, evidence grades, or experimental conclusions are published here.", sections: [{ title: "2026-09-09 · Evidence v1", body: "Added structured provenance, sample gates, source snapshots, signed verification, and quasi-experiment constraints. Legacy reports are marked incomplete." }] },
  },
  benchmarks: {
    "zh-CN": { title: "公开基准", intro: "目前没有满足发布标准的公开基准。", sections: [{ title: "发布门槛", body: "只有具备真实数据集、标注协议、复核人信息、版本化结果和可下载证据包时才会发布；不会用演示数据冒充评测结果。" }] },
    en: { title: "Public benchmarks", intro: "No benchmark currently meets the publication standard.", sections: [{ title: "Publication gate", body: "A benchmark is published only with a real dataset, labeling protocol, reviewer disclosure, versioned results, and downloadable evidence bundle. Demo data is never presented as evaluation evidence." }] },
  },
  "case-studies": {
    "zh-CN": { title: "可验证案例", intro: "目前没有公开、已授权且附签名证据清单的客户案例。", sections: [{ title: "发布原则", body: "案例必须取得客户授权、说明时间范围与样本限制，并链接到可验证报告。Logo、评价和结果数字不会在无法核实时出现。" }] },
    en: { title: "Verifiable case studies", intro: "There are currently no public customer cases with consent and a signed evidence manifest.", sections: [{ title: "Publication rule", body: "Cases require customer consent, disclosed time and sampling limits, and a verifiable report. Logos, testimonials, and outcome figures remain hidden until substantiated." }] },
  },
};

export function TrustPage({ locale, kind }: { locale: Locale; kind: Kind }) {
  const copy = content[kind][locale];
  const links: Array<[Kind, string, string]> = [["methodology", "方法论", "Methodology"], ["security", "安全", "Security"], ["privacy", "隐私", "Privacy"], ["changelog", "变更记录", "Changelog"], ["benchmarks", "基准", "Benchmarks"], ["case-studies", "案例", "Cases"]];
  return <div className="evidence-paper min-h-screen"><SiteHeader locale={locale} showPrimaryCta={false} /><main className="mx-auto max-w-6xl px-5 py-12 sm:px-8 lg:py-20"><div className="grid gap-10 lg:grid-cols-[220px_1fr] lg:gap-16"><aside><div className="eyebrow text-primary">CIP Trust Center</div><nav className="mt-6 grid border-t border-border">{links.map(([id, zh, en]) => <Link key={id} href={`/${locale}/${id}`} aria-current={id === kind ? "page" : undefined} className={`border-b border-border py-3 text-sm transition-colors hover:text-primary ${id === kind ? "font-semibold text-primary" : "text-muted-foreground"}`}>{locale === "zh-CN" ? zh : en}</Link>)}</nav></aside><article><header className="border-b border-border pb-10"><p className="font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">Published standard · Evidence v1</p><h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-[-0.045em] sm:text-6xl">{copy.title}</h1><p className="mt-6 max-w-3xl text-lg leading-8 text-muted-foreground">{copy.intro}</p></header><div>{copy.sections.map((section, index) => <section key={section.title} className="grid gap-4 border-b border-border py-9 sm:grid-cols-[3rem_1fr]"><span className="font-mono text-xs text-primary">{String(index + 1).padStart(2, "0")}</span><div><h2 className="text-xl font-semibold tracking-tight">{section.title}</h2><p className="mt-3 max-w-3xl leading-8 text-muted-foreground">{section.body}</p></div></section>)}</div><footer className="pt-8 font-mono text-xs text-muted-foreground">CIP · Versioned public documentation</footer></article></div></main></div>;
}
