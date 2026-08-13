# AEOSTRU — 项目结构与实现架构

> 生成时间:2026-08-14 | 基于当前 master 分支代码扫描

## 1. 项目标识

| 项 | 值 |
|---|---|
| 项目名称 | **Cognition Intelligence Platform (CIP)** / `aeo-platform` |
| 项目路径 | `E:\Codes\AEO` |
| 版本 | 0.1.0 |
| 包管理器 | npm (`package-lock.json`) |
| 语言/框架 | Next.js 16.2.6 (App Router) + React 19.2.4 + TypeScript 5 |
| 数据库 | PostgreSQL (Prisma 7,`@prisma/adapter-pg` 驱动) |
| 消息队列 | BullMQ 5 + Redis (ioredis) |
| Git | master 分支,25 个提交,活跃开发中 |

### 产品定位

面向"AI 答案可见性 (AI Visibility)"的认知审计平台:

- 向主流大模型 (OpenAI / Anthropic / Gemini / Perplexity / OpenAI 兼容端点) 发送采样问题,
  观察品牌/实体在 AI 回答中的**被提及率、推荐份额、引用率、语义位置**;
- 生成**语义星云 (Semantic Nebula)**、长尾机会、问题版图等可交互的认知智能资产;
- 通过**实验对照 (treatment/control + 双重差分)** 证明内容干预带来的真实业务影响 (Proof 层);
- 提供客户工作台 (`/app`) 与运营商控制台 (`/admin`) 双端,中英双语 (默认 `zh-CN`)。

---

## 2. 技术栈

### 运行时与框架

- **Next.js 16** — App Router,`[locale]` 国际化路由段,`src/app/api` Route Handlers 作为后端 API
- **React 19** + Server Components(页面数据在服务端读取,客户端组件带 `"use client"`)
- **TypeScript 5**,路径别名 `@/*` → `src/*`

### 数据与基础设施

| 组件 | 用途 |
|---|---|
| PostgreSQL + Prisma 7 | 主存储,35+ 模型,`src/generated/prisma` 生成客户端 |
| Redis + BullMQ | 异步任务队列(`sampling.run` / `semantic.intelligence` 等 5 个队列),独立 worker 进程 |
| Qdrant (可选) | 语义向量检索层 |
| Neo4j (可选) | 图谱智能适配器 |
| S3 兼容对象存储 (可选) | AI 原始响应等对象工件 (`ObjectArtifact`) |
| 外部认知服务 (可选) | FastAPI 认知分析服务适配器 |

### 前端/UI

- Tailwind CSS 4 + shadcn/ui (Radix UI 1.4)
- **ReactFlow 11** + **d3-force** — 语义星云/认知宇宙图可视化
- Recharts 3 — 指标图表
- lucide-react 图标、react-hook-form + zod 表单校验

### AI 抽象层

- 多提供商运行时:OpenAI Responses / OpenAI 兼容 Chat Completions / Anthropic Messages / Gemini native / Perplexity Sonar
- 提供商与模型在**运营控制台可配置**(API Key 加密存储),支持 JSON Schema 输出、引用、联网搜索、Embeddings 能力探测
- 任务级路由策略 (`ProviderRoutingRule` + `TaskExecutionPolicy`):低/中/高三档路由,支持分片并行执行

---

## 3. 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│  Frontend (Next.js App Router, 服务端渲染为主)                │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ 官网 / 营销   │  │ 客户工作台    │  │ 运营商控制台       │  │
│  │ /:locale/*   │  │ /:locale/app │  │ /:locale/admin    │  │
│  └──────────────┘  └──────────────┘  └───────────────────┘  │
│  i18n: zh-CN / en (src/i18n)                                 │
└───────────────┬─────────────────────────────────────────────┘
                │ Route Handlers
┌───────────────▼─────────────────────────────────────────────┐
│  API 层 (src/app/api)                                        │
│  /api/auth · /api/projects · /api/runs · /api/probe-runs     │
│  /api/admin (providers/models/routing/queues/usage/logs...)  │
│  会话校验 (src/server/auth/session) + 角色权限                 │
└───────────────┬─────────────────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────────────────┐
│  服务层 (src/server) — 纯业务逻辑,无 HTTP 依赖                │
│  workflow │ sampling │ diagnosis │ semantic-nebula │         │
│  opportunity │ brand-probes │ proof │ report │ metrics │     │
│  ai (多提供商运行时) │ queue │ observability │ audit │ ...    │
└───────┬───────────────────────────────┬─────────────────────┘
        │ 同步调用 / 入队                │ 异步消费
┌───────▼──────────┐        ┌───────────▼─────────────────────┐
│  PostgreSQL      │        │  Worker (scripts/worker.ts)      │
│  (Prisma 35+表)  │        │  BullMQ: sampling.run /          │
│                  │        │  semantic.intelligence 等 5 队列  │
└──────────────────┘        └──────────────────────────────────┘
        外部依赖(可选):OpenAI/Anthropic/Gemini/Perplexity API、
        Qdrant、Neo4j、S3、外部认知服务
```

### 分层职责

| 层 | 位置 | 职责 |
|---|---|---|
| 页面层 | `src/app/[locale]/*/page.tsx` | 服务端读取数据 + 组合客户端组件 |
| API 层 | `src/app/api/**/route.ts` | 鉴权、输入校验 (zod)、调用服务层、返回 `DataState<T>` |
| 服务层 | `src/server/**` | 全部业务逻辑,被 API 与 Worker 复用 |
| 数据层 | `src/server/db.ts` + Prisma | `getPrisma()` 单例,懒连接 |
| 异步层 | BullMQ + Worker | 长任务(采样、星云构建、机会生成) |
| 可观测性 | `src/server/observability` | 分布式 trace (`TraceEvent` 表)、错误归一化、日志脱敏、CIP 指标 |

---

## 4. 目录结构详解

```
E:\Codes\AEO
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── layout.tsx / page.tsx     # 根布局(重定向到 /zh-CN)
│   │   ├── globals.css
│   │   ├── [locale]/                 # 国际化路由段
│   │   │   ├── page.tsx              # 官网首页(含认知宇宙 hero)
│   │   │   ├── product|pricing|use-cases|start|login|signup/
│   │   │   ├── app/                  # ★ 客户工作台
│   │   │   │   ├── projects/         # 项目列表 / 新建
│   │   │   │   └── projects/[projectId]/
│   │   │   │       ├── dashboard/    # 认知总览(指标卡片)
│   │   │   │       ├── runs/ evidence/      # Diagnose 阶段
│   │   │   │       ├── semantic-nebula/ semantic-coverage/ alerts/  # Cognition 阶段
│   │   │   │       ├── opportunities/ question-territory/           # Act 阶段
│   │   │   │       ├── proof/ reports/      # Prove 阶段
│   │   │   │       └── keywords/ queries/ competitors/ entity/ settings/  # 设置
│   │   │   └── admin/                # ★ 运营商控制台
│   │   │       ├── ai-providers/ models/ prompts/ routing/   # AI 治理
│   │   │       ├── users/ organizations/ projects/           # 多租户管理
│   │   │       ├── queues/ system/ logs/ usage/ audit-logs/  # 运维观测
│   │   └── api/                      # ★ 后端 API (Route Handlers)
│   │       ├── auth/                 # login/logout/me/signup
│   │       ├── projects/…            # 项目 CRUD + 各领域子资源
│   │       ├── runs/[runId]/execute/ # 采样执行触发
│   │       ├── probe-runs/…          # 品牌探针运行管理
│   │       └── admin/…               # 运营商管理 API
│   ├── components/
│   │   ├── ui/                       # shadcn 基础组件
│   │   ├── layout/                   # site-header / app-shell / 阶段导航
│   │   ├── auth/ brand/ dashboard/ diagnosis/ project/ report/ workflow/
│   │   ├── semantic-intelligence/    # ★ 认知宇宙、机会面板、问题版图、证据抽屉
│   │   └── proof/ admin/             # 实验操作、AI 治理表单
│   ├── server/                       # ★ 服务层(121 文件,核心)
│   │   ├── db.ts                     # Prisma 单例 + DataState
│   │   ├── ai/                       # 多提供商运行时:registry/parsers/config/prompts
│   │   │   └── prompts/              # 关键词/查询/答案提取/机会提示词
│   │   ├── workflow/                 # keyword-service / query-service
│   │   ├── sampling/                 # execute-run.ts 采样执行引擎
│   │   ├── diagnosis/                # runFullDiagnosis 六阶段诊断管线
│   │   ├── semantic-nebula/          # ★ 语义星云:术语提取→引力打分→向量投影→坐标
│   │   ├── opportunity/              # 长尾机会生成、问题版图构建
│   │   ├── brand-probes/             # 品牌探针:生成/微批调度/限流/吞吐控制/信号提取
│   │   ├── analysis/                 # 响应分析、稳定性、语义覆盖、因果统计、proof-service
│   │   ├── proof/                    # (位于 analysis/)实验 + 结果归因
│   │   ├── report/                   # 报告快照/分析/润色
│   │   ├── queue/                    # BullMQ 队列客户端 + worker 健康
│   │   ├── observability/            # trace / event-log / errors / redaction
│   │   ├── auth/ audit/ billing/ security/ validation/
│   │   ├── projects/ data/ entity/ dashboard/ metrics/
│   │   ├── jobs/                     # AnalysisJob 阶段更新
│   │   ├── external/                 # qdrant / neo4j / object-storage / cognitive-service
│   │   └── probe/                    # 探针注册表与输入归一化
│   ├── lib/                          # utils.ts + client/reload.ts
│   ├── i18n/                         # 词典(zh-CN/en)、认知简报文案、proof 文案
│   └── generated/prisma/             # Prisma 生成客户端(不手改)
├── prisma/
│   ├── schema.prisma                 # 全部数据模型(35+ 模型)
│   ├── migrations/                   # 14 个迁移
│   └── seed.ts / seed-demo.ts        # 种子数据
├── scripts/
│   ├── worker.ts                     # ★ BullMQ worker 入口
│   ├── validate-local.ts / check-api-trace.ts / probe-run-load-sim.ts
│   └── setup-provider-routing.ts / test-providers.ts / scan-ui.ts
├── docs/                             # 架构文档 / runbooks
└── AGENTS.md / README.md / .env.example
```

---

## 5. 核心业务流程

### 5.1 全量诊断管线 (`runFullDiagnosis`,六阶段)

```
DIAGNOSIS_UNDERSTANDING_ENTITY   确保 ProjectSubject(品牌/产品/人物/网站)
        ↓                        不足 20 关键词 → 生成语义关键词
DIAGNOSIS_BUILDING_QUESTION_MAP 不足 10 问题 → 生成买家问题(24–36 条)
        ↓
DIAGNOSIS_SAMPLING_AI_ANSWERS   创建 SamplingRun(baseline)→ executeSamplingRun
        ↓                        向配置的 AI 提供商逐条采样回答
DIAGNOSIS_MAPPING_SEMANTIC_FIELD 构建语义星云快照(6 个 scope)
        ↓
DIAGNOSIS_FINDING_OPPORTUNITIES  生成长尾机会快照 + 问题版图快照
        ↓
DIAGNOSIS_BUILDING_EVIDENCE_REPORT 生成 AI 认知审计报告
```

- 每阶段通过 `AnalysisJob.result.stageHistory` 持久化进度,UI 实时轮询 (`/api/projects/[projectId]/diagnosis/status`)
- 队列可用时经 BullMQ 执行,否则降级为进程内后台执行

### 5.2 语义星云 (Semantic Nebula) — 核心智能资产

1. **术语提取** `semantic-term-extractor`:从采样回答提取语义术语(16 种类型 + 极性)
2. **引力打分** `semantic-gravity`:频率、场景稳定性、共现强度、情感、推荐语境、证据置信度加权
3. **向量空间** `entity-vector-space`:Embeddings 驱动(优先用启用了 embeddings 的已连接提供商,可选 EMBEDDING_API_URL 覆盖)→ 真实坐标
4. **构建快照** `nebula-builder`:节点(术语)+ 边(共现/语义相近等),按 6 个 scope(`OVERALL`/`POSITIVE_NEGATIVE`/`SCENARIO`/`COMPETITOR`/`MISSING`/`RISK`)存 `nodeJson/edgeJson`
5. **前端渲染** `cognition-universe.tsx`(ReactFlow + d3-force)读取 `nodeJson`,支持证据抽屉展示原始 AI 引用

### 5.3 品牌探针 (Brand Probes) — 大规模测量引擎

- `probe-generator` 按 8 个探针区(`core_semantics`/`implicit_recommendation`/`competition`/…)× 语义温度生成探针
- `micro-batch-builder` + `throughput-controller` + `rate-limiter`:微批调度、动态吞吐/并发/批量自适应、退避
- `probe-runner` 消费队列,`signal-extractor` 从响应提取 8 类信号,`probe-quality-scorer` 质量评分
- 运行配置(目标吞吐、预算、模式)由 env `PROBE_*` 控制,支持 demo/standard/max500/max1000

### 5.4 Proof 层 — 因果归因

- **CognitionExperiment**:问题簇拆分 treatment/control 双臂
- **实验波次**:baseline → 干预 → retest,每波产生观测
- **双重差分** (`causal-statistics.differenceInDifferences`):净提升 = 处理组增量 − 对照组增量(扣除模型漂移),附 z 检验显著性
- **相关性分析**:AI 可见性时间序列 × 外部业务结果(GA4/CSV/Webhook)配对,报告 Pearson 相关 + 滞后相关

---

## 6. 数据模型概览(Prisma,35+ 模型)

**身份与多租户**:`User` / `Session` / `Organization` / `OrganizationMember` / `LocalePreference`
(角色:platform_owner / operator_* / customer_*;套餐:free / pro / scale)

**项目域**:`Project` / `ProjectSubject`(实体:BRAND/PERSON/WEBSITE/PRODUCT)/ `Competitor`

**语义基础**:`SemanticKeyword`(6 类)/ `AeoQuery`(9 类查询意图 × persona × contextMode × 深度层级)

**采样与回答**:`SamplingRun` / `QuerySample` / `AIResponse` / `AnswerAnalysis` / `EntityMention` / `CitationSource` / `Alert`

**智能快照**(JSON 承载,版本化):`SemanticNebulaSnapshot`(6 scope)/ `LongTailOpportunitySnapshot` / `QuestionTerritorySnapshot` / `SemanticCoverageSnapshot`

**探针测量**:`BrandProbeRun` / `BrandProbe` / `BrandProbeBatch` / `BrandProbeResponse` / `ExtractedSignal` / `ProbeResult` / `ProbeTemplate`

**度量**:`MetricSnapshot`(AI 包含度/可见度/提及率/推荐份额/引用率/语义覆盖/稳定性/幻觉风险…)/ `StabilitySnapshot` / `ConfidenceInterval` / `ExternalMetricSource` / `ExternalMetricPoint`

**因果实验**:`CognitionExperiment` / `ExperimentQuestion` / `ExperimentWave` / `ExperimentObservation` / `ExperimentResult`

**AI 治理与运维**:`AIProvider` / `AIModel` / `AIUsageLog` / `PromptTemplate` / `ProviderRoutingRule` / `TaskExecutionPolicy` / `PromptRun` / `AnalysisJob` / `ObjectArtifact` / `AuditLog` / `TraceEvent` / `Report`

---

## 7. 测试与质量

- 23 个单元测试(`tsx --test`,`npm test`),覆盖:因果统计、星云构建/投影/引力、响应分析、报告、品牌探针生成/吞吐控制、机会评分、问题版图、认证会话、可观测性等
- 新增文件需配套测试(`*.test.ts` 与源文件同目录)

## 8. 运行方式

```bash
npm install && cp .env.example .env   # 配置 DATABASE_URL / REDIS_URL 等
npm run db:generate && npm run db:migrate && npm run db:seed
npm run dev        # Web 应用 (localhost:3000)
npm run worker     # BullMQ worker(需 REDIS_URL)
npm run validate:local   # 本地全栈校验
```

- 种子账号:`operator@aeo.local` / `Operator@123456`(运营)、`demo@observable-ai.local` / `Customer@123456`(客户)
- 生产要求真实 worker 进程(PM2 / systemd / 独立容器),worker 每 10s 写 Redis 心跳,`/admin/system` 展示健康状态

## 9. 架构要点速记

1. **Next.js 即全栈**:无独立后端服务,`/api` Route Handlers + 服务层复用,Worker 独立进程共享同一服务层代码
2. **AI 提供商可配置**:API Key 加密入库,运营控制台管理,路由策略按任务分档
3. **一切证据可追溯**:原始 AI 响应入 `ObjectArtifact`/`AIResponse`,trace 事件入 `TraceEvent`,报告快照持久化
4. **产品主线**:Diagnose(采样)→ Cognition(星云/覆盖)→ Act(机会/版图)→ Prove(实验/报告)
5. **降级友好**:Redis 缺失时队列任务可在进程内执行;数据库未配置时页面显示 `DataState` 引导
