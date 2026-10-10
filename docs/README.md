# 📚 Ox Shopping 文档中心

> 本目录是项目的常青文档（不随某次迭代过期）。带日期的内部审计文档（`COMMERCIAL_*`、`PROJECT_AUDIT_*` 等）是历史存档，仅作背景参考。

## 按角色找文档

| 我想… | 读这个 |
| --- | --- |
| 5 分钟跑起来看看 | [README 快速开始](../README.md#一键启动推荐docker) |
| 了解系统架构与数据模型 | [架构说明](architecture.md) |
| 参与开发 / 二次开发 | [开发指南](development.md) |
| 跑测试 / 更新视觉基线 | [测试体系](testing.md) |
| 部署到生产服务器 | [部署手册](deployment.md) |
| 使用管理后台 | [后台使用手册](admin-guide.md) |
| 接入真实 Stripe 收款 | [支付渠道接入](payment-channels.md) |

## 文档地图

| 文档 | 内容一句话 |
| --- | --- |
| [architecture.md](architecture.md) | 技术选型、组件关系图、请求生命周期、认证机制、核心 ER 图、CI 流水线图 |
| [development.md](development.md) | 本地环境、目录职责、数据库工作流、关键机制速览、常用命令速查、常见任务配方 |
| [testing.md](testing.md) | 单测 / 集成 / E2E / 视觉回归四层测试、`_test` 库安全守卫、基线更新工作流 |
| [deployment.md](deployment.md) | 生产部署步骤、必填环境变量表、备份与恢复演练、升级流程、Nginx + HTTPS |
| [admin-guide.md](admin-guide.md) | 管理后台功能图文手册（商品、订单、支付、分销、用户、设置） |
| [payment-channels.md](payment-channels.md) | 支付渠道设计：渠道加密、Stripe 接入、模拟支付与回调验证 |

## 截图索引

前台截图（来自 CI 平台的 Playwright 真实渲染）：

| 截图 | 文件 |
| --- | --- |
| 首页 / 商品列表 / 商品详情 | [screenshots/home.png](screenshots/home.png) · [screenshots/plp.png](screenshots/plp.png) · [screenshots/pdp.png](screenshots/pdp.png) |
| 集合页 / 搜索弹层 / 购物车 | [screenshots/collections.png](screenshots/collections.png) · [screenshots/search.png](screenshots/search.png) · [screenshots/cart.png](screenshots/cart.png) |

后台截图（本地生产模式真实截图）见 [admin-guide.md](admin-guide.md) 各节插图。

## 反馈与勘误

文档与代码不一致即是 Bug——欢迎提 Issue 或 PR 修正。提交信息规范见 [开发指南 § 开发规范](development.md#开发规范)。
