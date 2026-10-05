# ============ 依赖安装阶段 ============
FROM node:20-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
# postinstall 会跑 `prisma generate`，deps 阶段必须先有 schema（P0 复发修复：
# 此前只有 package.json 就 npm ci，postinstall 找不到 prisma/schema.prisma 直接
# exit 1 —— docker build 在第一步就失败，compose 生产/演示与 CI docker-smoke 全挂）。
# 只 COPY schema 这一个文件：依赖层缓存仍只受 package*.json + schema 变化影响。
COPY prisma/schema.prisma ./prisma/
RUN npm ci --no-audit --no-fund

# ============ 构建阶段 ============
FROM node:20-bookworm-slim AS builder
WORKDIR /app
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# 页面均为动态渲染，构建期不需要数据库连接
RUN npx prisma generate && npm run build

# ============ 运行阶段 ============
FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates wget && rm -rf /var/lib/apt/lists/* \
  && addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# Next.js standalone 输出
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
# Prisma CLI/运行时与种子工具（standalone 不含 devDependencies，需手动带入）
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.bin/prisma ./node_modules/.bin/prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/tsx ./node_modules/tsx
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/esbuild ./node_modules/esbuild
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/dotenv ./node_modules/dotenv
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/bcryptjs ./node_modules/bcryptjs
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# 容器健康检查：/healthz 是 readiness，数据库不可用时返回 503。
# /api/healthz 是不访问外部依赖的 liveness，供反代/编排探活使用。
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# 运维 P0 修复（2026-09-28）：此前入口调用 `node scripts/wait-for-db.mjs`，
# 而该脚本已在 3a1ff5f「删除 37 个僵尸脚本」中移除 → ENTRYPOINT 的 && 链首段即失败，
# **docker compose 生产/演示两条路径全部起不来**（CI docker-smoke 必红）。
# 现在改为：不依赖外部等待脚本 —— compose 已用 depends_on: condition: service_healthy
# 等到 postgres/redis 就绪；裸 `docker run` 时 migrate 失败即退出，由 restart 策略重试。
# 只允许 migrate deploy → 可选 seed → 启动。
# 缺少迁移目录时必须失败，禁止生产镜像回退 db push（db push 可能造成不可审计的数据破坏）。
# seed 默认不执行（生产运营数据不得被种子覆盖）；本地演示可设 SEED_ON_START=true。
ENTRYPOINT ["/bin/sh", "-c", "test -n \"$(find prisma/migrations -mindepth 1 -maxdepth 1 -type d -print -quit)\" || { echo '[entrypoint] prisma/migrations 缺失，拒绝启动'; exit 1; }; npx prisma migrate deploy || { echo '[entrypoint] 迁移失败（数据库不可用或迁移出错），容器退出等待编排重启'; exit 1; }; if [ \"$SEED_ON_START\" = \"true\" ]; then npx prisma db seed; fi; exec node server.js"]
