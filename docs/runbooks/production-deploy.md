# CIP 公网部署手册（VPS + Docker Compose）

Last updated: 2026-08-14

本手册面向**海外客户**的单机部署：一台 VPS 上跑通 Web（Next.js）+ Worker（BullMQ）+ PostgreSQL + Redis，Caddy 反向代理并自动签发/续期 HTTPS 证书。对外只暴露 80/443。

架构：

```
Internet ──> Caddy (80/443, 自动 HTTPS)
                └──> web (next start, :3000)
                       ├── worker (BullMQ 采样/语义智能队列)
                       ├── postgres:16 (数据持久化，不对外)
                       └── redis:7 (队列/限流/心跳，不对外)
```

## 0. 前置准备

- **一个域名**：Namecheap / Cloudflare / 任意注册商。把 A 记录指向 VPS 公网 IP（见第 3 节）。
- **一台海外 VPS**：推荐 Vultr / DigitalOcean / Hetzner，**2 vCPU / 4 GB 起**，Ubuntu 24.04。
  机房按客户所在地选：北美客户选美东，欧洲选法兰克福，亚太选新加坡。
  4 GB 内存是 Web + Worker + Postgres + Redis 同机运行的舒适下限；客户量上来后内存优先加到 8 GB。
- 服务器上只需要 Docker，不需要安装 Node（所有依赖在镜像里）。

## 1. 服务器初始化

```bash
# 以 root 或 sudo 用户执行
apt update && apt upgrade -y

# 安装 Docker + compose 插件
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker
docker compose version   # 应显示 v2.x

# 防火墙：只放行 SSH / HTTP / HTTPS
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

> Postgres/Redis 容器不发布端口，防火墙无需放行 5432/6379。

## 2. 拉取代码并配置

```bash
mkdir -p /opt/aeo && cd /opt/aeo
git clone https://github.com/MuadibUsul/SUPERAEO.git .
git checkout fix/audit-findings-2026-08-14   # 或你的发布分支

# 生成生产环境配置
cp .env.production.example deploy/.env
```

编辑 `deploy/.env`，逐项填写：

```bash
POSTGRES_PASSWORD=<随机强密码>            # 例: openssl rand -base64 24
DATABASE_URL=postgresql://aeo:<同一密码>@postgres:5432/aeo?schema=public
ENCRYPTION_KEY=<openssl rand -base64 32>  # 必须 ≥32 字节随机值
APP_BASE_URL=https://你的域名
```

> **ENCRYPTION_KEY 一旦生成不要更换**：操作员控制台里保存的 AI 提供方密钥都用它加密，换掉会导致所有已存密钥无法解密。
> 域名占位符同样出现在 `deploy/Caddyfile` 里，记得一起替换。

## 3. DNS

在域名注册商/DNS 面板添加记录：

| 类型 | 主机 | 值 |
|---|---|---|
| A | @ | VPS 公网 IP |
| A | www（可选） | VPS 公网 IP |

先解析再启动 Caddy，否则 Let's Encrypt 签发失败（Caddy 之后会自动重试）。

## 4. 启动

```bash
cd /opt/aeo
docker compose -f deploy/docker-compose.yml up -d --build
```

启动顺序由 compose 编排：

1. `postgres` 健康检查通过（pg_isready）
2. `migrate` 一次性执行 `prisma migrate deploy`（15 个迁移，自动幂等）
3. `web` + `worker` 在迁移成功后启动
4. `caddy` 反向代理并申请证书

查看状态：

```bash
docker compose -f deploy/docker-compose.yml ps
docker compose -f deploy/docker-compose.yml logs -f web worker
```

## 5. 初始化管理员账号

```bash
cd /opt/aeo
docker compose -f deploy/docker-compose.yml run --rm web npm run db:seed
```

seed 会创建两个账号（**seed 不区分环境，生产照跑**）：

- 操作员：`operator@aeo.local` / `Operator@123456`
- 演示客户：`demo@observable-ai.local` / `Customer@123456`

**上线必做**：立即登录操作员账号，在控制台修改密码；演示客户账号要么删除，要么同样改密。客户账号应通过注册页/管理员流程创建，不要沿用 seed 账号。

## 6. 上线验证清单

1. 浏览器打开 `https://你的域名`，确认证书有效（地址栏锁图标）。
2. 用修改后的操作员账号登录 → 管理控制台 → System Health：
   - `database`、`queue`（Redis PING）为 ok
   - `worker` 显示 **up**，心跳在 30 秒内刷新（每 10 秒心跳一次）
   - 队列深度可见、无堆积
   - `qdrant` / `neo4j` / `cognitive` / `objectStorage` 显示"未配置"是**预期行为**（v1 不启用）
3. 管理控制台 → AI Providers：启用至少一个提供方并填入真实密钥（密钥用 ENCRYPTION_KEY 加密入库），配置路由规则。
4. 创建一个客户账号，登录客户工作台，发起一次采样诊断，确认任务从队列被 worker 消费并跑完。
5. 用错误密码连续登录触发限流（生产环境 Redis 缺失时限流会 fail-closed 返回 503——如果出现，检查 REDIS_URL）。

## 7. 日常运维

### 备份（必做）

```bash
cd /opt/aeo/deploy
chmod +x backup.sh
# 手动跑一次验证
./backup.sh
# 写入 crontab: 每天 02:30
crontab -e
# 30 2 * * * cd /opt/aeo/deploy && ./backup.sh >> /var/log/aeo-backup.log 2>&1
```

备份文件在 `deploy/backups/`（保留 7 天）。**必须定期拷出服务器**（rclone/rsync 到对象存储或另一台机器）——同机备份不算备份。

恢复演练（先建空库再灌）：

```bash
gunzip -c backups/aeo-20260814-023000.dump.gz | docker compose exec -T postgres \
  pg_restore -U aeo -d aeo --clean --if-exists
```

### 升级

```bash
cd /opt/aeo
git pull
docker compose -f deploy/docker-compose.yml up -d --build   # 迁移自动执行
```

新迁移默认自动应用。升级前先 `./backup.sh` 一次。

### 日志与证书

```bash
docker compose -f deploy/docker-compose.yml logs -f --tail 100 web worker caddy
```

HTTPS 证书由 Caddy 自动续期（caddy_data 卷持久化），无需人工干预。

### 常见故障

| 现象 | 排查 |
|---|---|
| 登录/注册返回 503 | `DATABASE_URL` 错误或 postgres 未健康；容器日志确认 |
| 诊断返回 503 "Background processing is not available" | `REDIS_URL` 缺失或 worker 未启动（`docker compose ps` 看 worker） |
| System Health 显示 worker down | worker 崩溃：`docker compose logs worker`；心跳 30 秒不刷新即判 down |
| 429 限流异常 | `TRUSTED_PROXY` 应保持 `true`（Caddy 会覆盖 X-Forwarded-For）；若直接暴露 3000 端口则保持 false |
| HTTPS 证书没下来 | DNS 是否已解析到本机 IP；`docker compose logs caddy` 看申请错误 |
| 登录后马上掉线 | 确认通过 `https://` 访问（生产环境 session cookie 强制 secure） |

## 8. 安全清单（上线前逐项确认）

- [ ] 防火墙只放行 22/80/443（`ufw status`）
- [ ] SSH 使用密钥登录，禁用密码登录（`/etc/ssh/sshd_config` 的 `PasswordAuthentication no`）
- [ ] 服务器上只有 `deploy/.env` 含密钥，未提交、未进镜像（`.dockerignore` 已排除）
- [ ] `ENCRYPTION_KEY` 为 `openssl rand -base64 32` 生成的随机值
- [ ] seed 账号已改密或删除
- [ ] 每日备份 cron 已配置，且做过一次恢复演练
- [ ] 定期 `apt upgrade` 打系统补丁；镜像升级随代码版本走

## 9. 后续可选：启用扩展服务

Qdrant / Neo4j / S3 对象存储 / 外部认知服务均为**懒加载**，不配置时优雅降级（System Health 显示未配置，产品界面不假装有这些能力）。需要时在 `deploy/docker-compose.yml` 加服务并在 `.env` 填对应变量即可。

**已知的 env 命名不一致**（代码为准，文档为参考，启用时注意）：

| 能力 | 代码实际读取 | README 写的 |
|---|---|---|
| S3 对象存储 | `S3_ENDPOINT` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` / `S3_BUCKET` / `S3_REGION` | `OBJECT_STORAGE_*` |
| Neo4j | `NEO4J_URI` / `NEO4J_USER` / `NEO4J_PASSWORD` | `NEO4J_USERNAME` |

## 10. 明确不在 v1 范围

- 多实例横向扩展（单机单实例；worker 心跳/协议版本机制已为未来扩展预留，届时需统一 `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`）
- Next.js standalone 输出（worker 需要完整依赖树，`next start` 更简单可靠）
- 邮件系统（当前版本无邮件能力，客户账号由管理员/注册页创建）

## 11. 当前共享 VPS 的 GitHub Actions 部署

仓库的 `.github/workflows/deploy.yml` 在 `master` 更新后先执行完整校验，再由 GitHub
Actions 构建镜像并用提交 SHA 标签推送到 GHCR。服务器只负责拉取镜像并部署到
`/home/deploy/aeo`，不会在共享 VPS 上编译应用。该服务器已有共享 Caddy，因此使用
`deploy/docker-compose.shared.yml`，只把 `aeo-app` 接入外部 `web` 网络，不再次占用 80/443，
也不会操作现有的 `tline` 或 `gubugu` Compose 项目。
证据快照使用仅接入 `aeo_internal` 的私有 RustFS S3 服务及独立 `objectdata` 卷；
不发布 S3 或管理控制台端口。镜像按 OCI digest 固定，升级必须显式更新配置。

仓库 Actions Secrets：

- `DEPLOY_HOST`
- `DEPLOY_PORT`（默认 22）
- `DEPLOY_USER`
- `DEPLOY_SSH_KEY`

首次上线还需要在服务器创建 `/home/deploy/aeo/deploy/.env`，并在
`/opt/caddy/Caddyfile` 中为正式域名添加 `reverse_proxy aeo-app:3000`。后续代码更新无需再次修改 Caddy。
工作流会在更新后从 Web 容器执行 `npm run trust:readiness`；PostgreSQL、Redis、私有对象存储
或 Ed25519 签名任一未配置，部署都会明确失败，不能被标记为可信发布。
