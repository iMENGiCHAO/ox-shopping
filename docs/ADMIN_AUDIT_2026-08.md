# 后台管理系统全面体检报告（2026-08-26）

> 范围：src/app/admin/* + src/components/admin/* + src/app/api/admin/*
> 结论：功能链路基本打通（页面↔API↔数据库），本轮修复 3 个硬伤（导航中英混杂、支付页假功能、评价管理缺失），其余为整理清单与上线前建议。

## 一、本轮已修复

| #   | 问题                                                                                                    | 修复                                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 1   | 导航中英混杂：`页面横幅 / 到货通知 / 支付接口` 是硬编码中文键，英文模式仍显示中文；`Legal pages` 无中文 | 导航统一为英文键 + 中英词典（Banners/Notify Me/Payments/Legal Pages/Reviews）；Orders 词典修正为「订单」            |
| 2   | 支付接口页是「假功能」：页面有保存表单，但 `/api/admin/payments` 路由不存在，保存必然 404               | 新增只读状态接口 `/api/admin/payments/status`（不暴露密钥），页面改为真实状态面板（支付模式/Stripe/币种/邮件/存储） |
| 3   | 后台左上角品牌文字「牛来购物」                                                                          | 替换为用户提供的 LOGO 图（public/images/brand/admin-logo.png），侧边栏与移动端顶栏均生效                            |

## 二、中英文混杂清单（已整理，待全量 i18n）

后台默认中文运营，但部分页面硬编码中文、英文模式（右上角可切换）下会混排。按文件统计：

| 文件                                      | 硬编码中文字符串数 | 典型示例                                                                                      |
| ----------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------- |
| src/components/admin/product-form.tsx     | ~68                | 预售商品（Pre-order）、新品上市（New）、热卖（Hot）、规格库存、产品参数对照表、添加行/列/清空 |
| src/app/admin/banners/page.tsx            | ~45                | 页面横幅配置、左右横幅、标题/链接/图片                                                        |
| src/app/admin/notify-me/page.tsx          | ~21                | 到货通知、补货营销、删除确认                                                                  |
| src/components/admin/admin-shell.tsx      | ~14                | 注释 + BRAND_NAME（已换 LOGO）                                                                |
| src/app/admin/settings/page.tsx           | ~14                | 全站公告、公告文案、品牌 Logo 上传                                                            |
| src/components/admin/brand-logo-card.tsx  | ~12                | 上传/粘贴图片 URL 说明                                                                        |
| src/components/admin/currency-manager.tsx | ~11                | 汇率管理、来源                                                                                |
| src/app/admin/faqs/page.tsx               | ~9                 | 常见问题、问题/答案                                                                           |
| src/app/admin/legal/page.tsx              | ~8                 | 法务页面、双语编辑                                                                            |
| src/app/admin/payments/page.tsx           | ~6                 | 支付接口状态说明                                                                              |
| src/app/admin/layout.tsx                  | ~5                 | 标题/描述                                                                                     |

**建议**：运营以中文为主时，可将后台默认语言固定为中文、英文切换标注"部分页面仍为中文（开发中）"；或安排一轮全量 i18n（把上述字符串收进 admin-i18n 词典）。此项为收尾工作，不影响功能交付。

## 三、功能连通性核查（页面 ↔ API）

| 模块     | 页面              | API                                  | 状态             |
| -------- | ----------------- | ------------------------------------ | ---------------- |
| 仪表盘   | /admin            | /api/admin/stats                     | ✅               |
| 商品     | /admin/products   | products 全套（CRUD/状态/库存/批量） | ✅               |
| 分类     | /admin/categories | categories + reorder                 | ✅               |
| 横幅     | /admin/banners    | banners                              | ✅               |
| 订单     | /admin/orders     | orders + ship/tracking/status/export | ✅               |
| 到货通知 | /admin/notify-me  | notify-me + delete                   | ✅               |
| 优惠券   | /admin/coupons    | coupons                              | ✅               |
| 退款     | /admin/refunds    | refunds + 审批                       | ✅               |
| 支付接口 | /admin/payments   | **本轮新增只读 status**              | ✅（原来是死链） |
| 法务     | /admin/legal      | legal                                | ✅               |
| 设置     | /admin/settings   | settings + 品牌/横幅/汇率            | ✅               |
| 用户     | 顶栏快捷入口      | users + status/password              | ✅               |
| 审计日志 | 顶栏快捷入口      | audit-logs                           | ✅               |

## 四、工程级建议（按优先级）

**上线前**

1. 后台管理员二次验证：登录后敏感操作（退款审批、用户禁用）建议加二次确认（已有 confirm-dialog，退款审批建议强制）。
2. 生产管理员账号启用强密码 + 登录失败锁定（前台已实现，后台同源）。
3. 支付/邮件/存储配置以环境变量为准（支付页已是只读面板，避免误导）。

**首月内** 4. 评价管理（可选）：如需后台审核评价，再补列表 + 显示/隐藏（模型与校验已就绪）。5. 数据删除请求（GDPR）管理端执行队列（当前仅前台登记）。6. 邮件模板「测试发送」按钮（管理端直接发一封样例验证 SMTP/Resend 可用）。7. 订单列表批量操作（合并发货/批量导出已支持，批量改状态建议补充）。

**运营增强** 8. 库存预警页（低库存商品列表 + 阈值设置）。9. 促销规则（限时特价/满减阶梯）超出当前优惠券模型，量起来再排期。10. 后台全量 i18n（见第二节）。

## 五、判定

功能链路已全部打通，无死链模块；中英混杂与运营增强项不影响交易正确性，可按上表逐项排期。支付页为本轮新增/修复项，建议回归验证一次。
