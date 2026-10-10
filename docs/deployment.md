# 🚢 部署手册（生产）

> 形态：单机 Docker Compose。目标读者：把项目部署到自己服务器的运维/站长。
> 本地演示部署（RustFS + 种子 + 弱密钥）见 [README](../README.md#一键启动推荐docker)——**那是演示，不是生产**。

## 1. 生产与演示的区别

| 维度 | 演示（`docker-compose.local.yml`） | 生产（仅 `docker-compose.yml`） |
| --- | --- | --- |
| 密钥 | 弱密钥 + `REQUIRE_STRONG_SECRETS=false` | **强密钥缺失时拒绝启动** |
| 支付 | `PAYMENT_MODE=mock` | Stripe（漏配启动守卫会拦） |
| 对象存储 | RustFS 容器 | AWS S3 / Cloudflare R2 |
| 种子 | 自动种子 + 演示账号 | 不自动种子；用 `npm run admin:create` 建管理员 |
| 邮件 | `console`（只打印） | Resend / SMTP |

## 2. 部署步骤

### 2.1 准备

- 一台 2C4G 起步的 Linux 服务器，安装 Docker Engine + compose 插件
- 一个域名，A 记录指向服务器
- TLS 证书（下面 Nginx 方案用 acme.sh/Let's Encrypt 皆可）

### 2.2 克隆并配置环境变量

```bash
git clone https://github.com/iMENGiCHAO/ox-shopping.git && cd ox-shopping
cp .env.example .env   # 不存在则参照 README §环境变量参考逐项创建
```

`.env` 必填项（生产）：

| 变量 | 要求 |
| --- | --- |
| `POSTGRES_PASSWORD` | 强口令（compose 强制插值，漏配直接拒启） |
| `REDIS_PASSWORD` | 强口令 |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | ≥32 位随机（`openssl rand -base64 48`） |
| `PAYMENT_CHANNEL_ENC_KEY` | ≥32 位随机（`openssl rand -base64 32`） |
| `SITE_URL` | `https://你的域名` |
| `SITE_NAME` | 品牌名 |
| `MAIL_PROVIDER` + 对应密钥 | `resend`（推荐）或 `smtp` |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Stripe 接入见 [payment-channels.md](payment-channels.md) |
| S3 系列（用 `STORAGE_DRIVER=s3` 时） | `S3_ENDPOINT/S3_BUCKET/S3_ACCESS_KEY_ID/…` |

### 2.3 启动

```bash
docker compose up -d --build          # 注意：不加 local overlay
docker compose logs -f app            # 看迁移与启动是否干净
```

### 2.4 验证

```bash
curl -f http://localhost:3000/healthz    # readyz：真连数据库，200 才算就绪
curl -f http://localhost:3000/api/healthz  # liveness：纯进程存活
```

> **两个健康探针的区别**：`/healthz` 会真的执行 `SELECT 1`（数据库挂了返回 503），给 Nginx/编排做摘流用；`/api/healthz` 只表示进程活着。监控告警请盯前者。

### 2.5 建管理员

种子演示账号在生产被护栏跳过，管理员用脚本创建：

```bash
docker compose exec app npx tsx scripts/admin-create.ts
```

## 3. Nginx + HTTPS（前端反代）

```nginx
server {
    listen 443 ssl http2;
    server_name shop.example.com;

    ssl_certificate     /etc/nginx/ssl/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/privkey.pem;

    client_max_body_size 10m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
server {
    listen 80;
    server_name shop.example.com;
    return 301 https://$host$request_uri;
}
```

## 4. 备份与恢复

- **自动**：`db-backup` sidecar 定时 `pg_dump` + WAL 归档到挂载卷（`dbbackups`）。
- **手动**：`npm run db:backup`（scripts/backup-db.sh，自动剥离 `schema` 查询参数兼容 pg_dump）。
- **演练**：`bash scripts/backup-restore-drill.sh`——完整走一遍 备份 → 建临时库 → 恢复 → 校验 → 清理。CI 每次推送都跑一遍这个演练；**建议生产每月人工跑一次**（注意脚本会用本机 pg_dump，版本必须 ≥ 服务器端，14 连 16 会被版本守卫拒绝）。

## 5. 升级流程

```bash
cd ox-shopping
git pull
docker compose up -d --build     # entrypoint 自动：migrate deploy → 启动
curl -f http://localhost:3000/healthz
```

数据库迁移由镜像 entrypoint 在启动前自动执行（`prisma migrate deploy`），失败即退出不接流量——**不要手动 psql 改库**。

## 6. 生产检查清单

上线前逐项打勾（完整版见 [PRODUCTION_CHECKLIST.md](PRODUCTION_CHECKLIST.md)）：

- [ ] 强密钥三件套（JWT ×2 + 渠道加密）全部 ≥32 位且与演示值不同
- [ ] `PAYMENT_MODE` 非 `mock`；Stripe webhook 在 Dashboard 配好并验签
- [ ] `SITE_URL` 为正式 https 域名（影响回调和邮件链接）
- [ ] 邮件通道真实可用（先发测试信）
- [ ] `/healthz` 接入监控告警
- [ ] 备份卷有异地同步（rsync/对象存储）
- [ ] 恢复演练跑过一次
- [ ] 管理员开启 2FA 前置的强密码策略；审计日志页能正常记录

## 7. 常见问题

| 症状 | 处置 |
| --- | --- |
| 启动即退出，日志喊密钥强度 | 正常护栏——给强密钥，别关护栏 |
| `pull access denied for minio/minio` | MinIO 已从 Docker Hub 撤镜像；生产用 AWS S3/R2，演示用仓库自带 RustFS 方案 |
| 502（Nginx 后） | 应用没就绪或挂了：`docker compose logs -f app` 看 entrypoint 是否迁移失败 |
| Webhook 一直 400 | Stripe 签名密钥与 `STRIPE_WEBHOOK_SECRET` 不一致 |
