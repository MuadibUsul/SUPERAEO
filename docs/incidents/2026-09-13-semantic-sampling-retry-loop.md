# 事件报告：语义诊断被重投导致重复采样与 token 超额消耗

- 日期：2026-09-13（时间均为 UTC）
- 状态：已止损（采样已停止、证据报告已补出）；根因修复待排期
- 影响环境：生产
- 影响对象：项目「Elon Musk AI 认知审计」`cmtzw2oc0003601p5m8xdu7r1`（主体 Elon Musk）
- 级别：中（成本与额度被超额消耗、任务长时间不结束），无数据损坏、无越权访问、无客户数据泄露

## 1. 摘要

一次正常的 `full_diagnosis` 任务在完成首轮 360 个语义探针采样后，进入了采样之后的后段阶段（物化 → 语义星云 → 机会/领地 → 证据报告）。后段阶段在 worker 容器内**堆内存耗尽导致进程终止**；由于任务不可续跑，BullMQ 将任务按 stalled 重新投递后，处理器**从零重跑了整个诊断流程**——包括最昂贵的那一轮 360 探针采样，于是又新建了一个探针 run 继续消耗 token。

首轮采样消耗 **4,433,950 token / 348 次模型调用**（14:08–14:24）。重投后的第二轮在止损前完成 162/360 个探针。运维停止 worker 后停止消耗。

用户可见的症状是"采集一直跑不完、四百多万 token 还没结束"，以及任务失败时的提示「语义智能任务失败，请重试或联系管理员」。

## 2. 影响

| 维度 | 结果 |
| --- | --- |
| Token 消耗 | 首轮 348 次调用 / **4,433,950 token**（14:08–14:24 实测）；重投轮在止损前完成 162 个探针 + 8 个失败；重投窗口内另计 14 次调用 / 159,328 token（14:33:57–14:36:57） |
| 持续时间 | 14:08:02 任务创建 → 14:34:29 停止 worker，约 26 分钟 |
| 用户可见 | 任务状态长时间停留在采样阶段；任务永不结束 |
| 数据完整性 | 无损坏。首轮 327 条成功响应完整保留并已物化为 SamplingRun |
| 交付物 | 已用首轮数据补出证据报告《Elon Musk AI Cognition Audit》（`cmtzxm0pv00080up4hm6ssung`） |
| 生产稳定性 | web / postgres / redis / object-storage 全程健康；无客户可感知的宕机 |

相关但独立的一项问题：控制台「预估费用」与实际计费不符（见 §7）。

## 3. 时间线

| 时间 | 事件 | 证据 |
| --- | --- | --- |
| 14:08:02 | 诊断任务创建，queue=semantic.intelligence，trace=0cdbd5c1 | `analysis_jobs` 行 |
| 14:08:07 | 首次执行开始 | `started_at` |
| 14:08:26 | 首次模型调用 | `ai_usage_logs` |
| 14:08:41 | 探针 run #1 创建（360 个探针，标准模式） | `brand_probe_runs` |
| 14:24:30 | 累计 348 次调用 / 4,433,950 token | `ai_usage_logs` 聚合 |
| 14:26:13.504 | run #1 完成：327 成功 / 33 失败；语义探索 stopReason=`TOKEN_BUDGET` | `brand_probe.run.completed`、覆盖快照 |
| 14:26:13 | 成功响应物化为 SamplingRun `cmtzwpz6j0bhx0wo63ay8lg95`（327 条响应） | `sampling_runs` |
| 14:26:14.5–14:26:19.9 | 后段阶段推进：11 次 `job.stage.changed`（星云/机会连续推进） | `trace_events` |
| **14:26:19.9–14:26:52.8** | **约 33 秒完全静默：无任何事件，且没有 `job.failed` / `worker.job.failed`** | `trace_events` |
| 14:26:52.812 | 任务被重新投递，`attempts=2`，`job.started` 重新出现 | `analysis_jobs`、`trace_events` |
| 14:26:53.295 | **探针 run #2 开始（又一轮 360 个探针）** | `brand_probe.run.started` |
| 14:34:29 | 运维停止 worker（止损）。此时 run #2 已 162 成功 / 8 失败 | `brand_probe_runs` |
| 14:36:57 | 二次停止 worker（此前一次运维重启的 2.5 分钟窗口内消耗 14 次调用 / 159,328 token） | `ai_usage_logs` |
| 14:37:01–14:37:04 | 基于首轮数据重建语义星云（6 个快照） | `semantic_nebula_snapshots` |
| 14:37:35 | 长尾机会 + 问题领地快照生成 | 快照表 |
| 14:37:37 | 报告阶段在 512MB 堆容器内 OOM（`FATAL ERROR: Reached heap limit … JSON.parse`） | 一次性容器日志 |
| 14:47:54–14:48:01 | 取消全部在途任务（含 UI 再次触发的 `cmtzxablz01d201p5ht3ykf51`） | `analysis_jobs` |
| 14:51:12 | 用 2GB 堆一次性容器重建报告**成功，耗时约 8 秒** | 运维日志 |
| 15:08:19 | 复核：worker 保持停止、0 个在途任务、近 5 分钟 0 调用 / 0 token | 运维日志 |

## 4. 根因

### 4.1 直接触发因素：后段阶段堆内存耗尽

worker 容器 `mem_limit: 768m`（默认 V8 堆上限约 512MB），而后段阶段的证据报告构建（`buildReportSnapshot`）需要解析并深拷贝体量很大的 JSON 聚合，超出该上限。

**已复现**：同一代码路径在 512MB 堆容器中稳定 OOM（栈顶为 `JsonParser`），在 2048MB 堆容器中 8 秒完成。事件当时 worker 容器的崩溃日志因 15:03 的部署重建容器而丢失，无法取到那一行 `FATAL ERROR`；但事件流水给出了等价证据——进程在 14:26:19 后失去全部心跳，**且未走异常捕获路径**（捕获路径会写入 `job.failed` / `worker.job.failed`，当时两者均不存在），与 OOM 中止进程一致，而非 `attempts: 2` 的常规失败重试。

### 4.2 放大机制：重投即从头重跑（结构性缺陷）

任务处理器 `runFullDiagnosis` 不可续跑：它每次执行都会走到 `createBrandProbeRunForProject` 并执行完整采样。因此**任何发生在采样之后的失败（甚至进程崩溃），都会以"再花一轮采样钱"作为重试代价**。

BullMQ 的 stalled 重投上限默认为 1 次（`maxStalledCount`），所以只重投了一次；若上限更高，损失会成倍放大。

### 4.3 促成因素

1. **预算闸门位置不对**：`SEMANTIC_EXPLORATION_MAX_TOKENS`（默认 1,000,000）只在基础探针 run **完成之后**评估，基础 run 本身不受预算约束。结果是预算"生效"时 4.4M token 已经花掉（stopReason 记的正是 `TOKEN_BUDGET`）。
2. **单轮成本高**：360 探针 × 微批 5、并发 24，单轮即数百万 token；重跑代价巨大。
3. **没有护栏**：token 消耗速率、任务重投次数均无告警或熔断，问题只能靠人工发现。

## 5. 检测、响应与止损

- 检测：用户报告"跑不完、四百多万 token"；随后通过生产库 `ai_usage_logs` 聚合与 `trace_events` 定位到重投。
- 止损：停止 worker 容器（立即切断全部模型调用）→ 删除 BullMQ 中在途任务并标记取消 → 保持 worker 停止不被拉起（避开部署窗口，部署窗口内实测 0 消耗）。
- 恢复交付：跳过采样，用首轮已完成数据补跑后段（星云 → 机会/领地 → 证据报告），任务置为 completed，报告可在项目报告页查看。
- 代价认知：一次运维重启把 worker 拉起 2.5 分钟，窗口内产生 159,328 token 消耗——恢复操作本身也需要按"最小开机面"执行。

## 6. 修复建议（按优先级）

**P0**

1. **提高 worker 内存/堆**：worker 设 `NODE_OPTIONS=--max-old-space-size=2048` 并将 `mem_limit` 提到 2g 以上（web 1g 的同类问题也一并评估）。这是最小改动、直接消除触发因素。
2. **让重试不重跑采样（根治）**：把诊断做成阶段幂等续跑——若项目已存在 `completed` 且探针数达标的 brand probe run / 已物化的 SamplingRun，则跳过采样直接进入后段。否则任何后段崩溃都会重复花钱。
3. **采样预算前置**：在探针 run 内部按累计 token 硬停（例如达到 `SEMANTIC_EXPLORATION_MAX_TOKENS` 的 80% 时停止派发新批次），而不是只在追加自适应探针前评估。

**P1**

4. **长耗时阶段的心跳保护**：把重 CPU/内存工作移出事件循环（子进程或分段异步），或显式延长 `lockDuration`，避免"忙于计算"被判定 stalled。
5. **告警与熔断**：按项目维度对 token 速率、单任务重投次数设阈值，触发告警并可选自动暂停。
6. **报告构建内存优化**：避免对大型聚合 JSON 的整树 `JSON.parse(JSON.stringify(...))` 深拷贝，分批/流式构建。

**P2**

7. 费用预估准确性（见 §7）。
8. 把本轮运维动作沉淀为 runbook（停止采样、取消在途任务、只用已完成数据补报告的步骤与命令）。

## 7. 相关未决问题：控制台预估费用不准确

用户反馈后台「预估费用」与实际不符。代码定位（`src/server/brand-probes/token-cost.ts` 的 `usageNumbers()`）：

- 计价只按 token 量乘以每百万单价，单价优先取环境变量 `SEMANTIC_EXPLORATION_INPUT_COST_PER_MILLION` / `SEMANTIC_EXPLORATION_OUTPUT_COST_PER_MILLION`，否则**按模型名前缀启发式**：`deepseek*` → 0.14 / 0.28，其余一律 → 5 / 20。
- 由此产生的偏差来源：① 非 DeepSeek 模型统一套用通用价；② 未考虑缓存输入折扣；③ 部分写入路径可能缺 `costUsd`/`costEstimate`，汇总时按 token 回填（`src/server/ai/usage-summary.ts`）；④ 多 provider / 多模型混跑时用同一价计算。

建议：把真实单价放到 provider/model 维度（`AIModel` 或 provider 记录）配置，并在用量页标注计价来源与生效单价。此项需独立排查确认差异方向与数量级（用户提供的截图在当前环境无法读取，需补充页面路径与预期值）。

## 8. 附：关键标识

| 对象 | 标识 |
| --- | --- |
| 项目 / 主体 | `cmtzw2oc0003601p5m8xdu7r1` / Elon Musk（域 https://x.com） |
| 诊断任务 / trace | `cmtzw2oiu003c01p5zr4phkz1` / `0cdbd5c1-3898-46b8-a1b1-b8a69590b5a5` |
| 探针 run #1（保留） | `cmtzw3fgd00160wo64mkxjbal`，327 成功 / 33 失败 / 360 |
| 探针 run #2（已取消） | `cmtzwqtei00030vo60927kzkg`，162 成功 / 8 失败 |
| 物化 SamplingRun | `cmtzwpz6j0bhx0wo63ay8lg95`（327 条响应） |
| 星云快照 | 6 条，如 `cmtzx3usp0000a5p57kcnv5ok` |
| 机会 / 领地快照 | `cmtzx4lgu000ea5p5y6msn05j` / `cmtzx4li3000fa5p56qhiodq7` |
| 证据报告 | `cmtzxm0pv00080up4hm6ssung`《Elon Musk AI Cognition Audit》 |
| 前置事件（另一问题） | 任务 `cmtzvcv6f001101p53zzwz70a` / trace `625b3674-e0cf-4404-9337-58672cff9fc8`，项目 `cmtwy47tn000m01rvtayatnvk`，失败原因：未启用任何 AI provider |

## 9. 当前状态（事件报告撰写时）

- worker 容器**处于停止状态**（按用户要求，采样不再继续）。影响：所有后台队列任务（采样、星云构建、报告生成等）都不会执行；需要恢复时启动 worker 即可。
- 在途任务为 0，近 5 分钟模型调用与 token 消耗均为 0。
- 该项目的诊断任务显示为 completed，证据报告可查看。
- 前端变更（首页认知星云接入真实语义场）已部署并验证；本次事件相关的临时运维工作流已从仓库移除。
