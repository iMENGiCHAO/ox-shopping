# 多实例部署 Runbook（水平扩展）

> 本文档说明星辰商城以多副本方式运行时，哪些机制保证正确性，以及上线前需要验证的清单。
> 状态：机制已就绪并经代码审查；**真实多实例演练待基础设施到位后执行**。

## 一、拓扑

```
            ┌─ instance A (next start :3000)
LB/CDN ─────┼─ instance B (next start :3000)
            └─ instance N ...
        共享: PostgreSQL(主) · Redis · S3 对象存储
```

- 无状态应用：会话在 JWT + Redis 撤销表，任何副本可服务任意请求
- 本地上传目录**不可用**于多实例——必须配置 `S3_*`（对象存储）
- `.mail-out` 控制台邮件仅限单机开发；生产必须 RESEND 或 SMTP

## 二、已内置的多实例安全机制

| 关注点 | 机制 | 位置 |
|---|---|---|
| 定时任务选主 | `pg_try_advisory_xact_lock` 事务级咨询锁，每 tick 仅一实例执行 | `src/server/jobs/scheduler.ts` |
| 库存扣减 | 事务内 `SELECT ... FOR UPDATE` 行锁 + 条件更新 | `order.service.ts createOrder` |
| 支付幂等 | `updateMany WHERE status=PENDING_PAYMENT` 原子认领 | `markOrderPaid` |
| 取消幂等 | 同上条件认领，防重复回补库存 | `cancelOrder` |
| 限流/缓存 | Redis 启用时全局一致；未启用退化为单进程内存版(**多副本必须开 Redis**) | `src/lib/rate-limit.ts` |
| 汇率缓存 | 进程内 6h + DB 持久层；各副本独立拉取属可接受偏差(数据源日更) | `currency-server.ts` |

## 三、上线前验证清单（演练脚本）

1. **双副本起服**：同库同 Redis，端口 3000/3001 各起一份。
2. **任务互斥**：观察两份日志一分钟，`[cron]` 心跳只应出现在一个实例。
3. **并发下单**：对同一 SKU 以 50 并发各发 25 单（总需求 > 库存），
   断言成功订单数量 = 库存数、无负库存（`scripts/load-test.mjs` 可作压测器，
   精确断言建议用 vitest 集成用例双进程复跑）。
4. **重复支付回调**：向两副本同时投递同一 `checkout.session.completed`，
   断言只有一笔 PaymentLog `paid` 记录、券计数只 +1。
5. **滚动发布**：更新期间旧副本处理中的请求不应出现结构错误
   （依赖迁移向后兼容：先加列后删列，两阶段发布）。

## 四、环境变量差异（相对单机）

```env
REDIS_ENABLED=true          # 多副本必须
S3_ENDPOINT=...             # 必须，禁本地磁盘上传
CRON_ENABLED=true           # 全部副本开启即可（咨询锁自动选主）
```
