# 2026-09 会话日记：后台推倒重设计 + 信息互动闭环 + 表格统一 + 横幅合并

> 范围：2026-08-31（本会话轮）
> 性质：用户反馈驱动的前台/后台体验全面优化（"以消费者最方便为导向" + "后台不静默"）
> 核心成果：
> 1. 后台视觉系统**推倒重设计**（作用域化设计令牌，前台零影响）
> 2. 分类落地页 hero 大横幅恢复（shop.x.com 对齐）
> 3. **双向信息通知闭环**（前端动作→后台必知；后台处理→客户必知）
> 4. 后台 8 张数据表样式**统一规范**（一套宽度体系，零变形）
> 5. 侧栏收起/展开修复 + 重复编辑入口清理

---

## 0. TL;DR — 大爷这一轮想要什么

| 诉求 | 落地 |
|------|------|
| 后端管理样式推倒重设计，前沿 SaaS 风 | ✅ `.admin-theme` 作用域令牌：8px 圆角 + 柔和阴影 + 浅灰分层，前台不动 |
| 分类内页横幅大图恢复（shop.x.com 一致） | ✅ 分类落地页 hero（透明顶栏叠图 + `[ Name ]` 左下标题） |
| PDP 售罄订阅提醒与后台到货提醒重复 | ✅ 删除 PDP 顶部独立 NotifyMeButton，保留官方按钮位（售罄→Notify me） |
| 表格长内容变形、状态换行、操作按钮被遮挡 | ✅ sticky 列实底 + 分隔线 + z 层级；badge 全局 nowrap；空菜单修复；操作列 padding 收紧 |
| 前端动作后台要知晓（不静默） | ✅ 新增 6 处 `notifyAdmins`：新订单/付款/退款/新用户/补货/降价 |
| 后台处理客户要及时知道 | ✅ 既有邮件+站内通知链路确认完整（发货/退款/取消/支付/降价/补货商品卡） |
| 后台消息中心 | ✅ 新页面 `/admin/notifications` + Bell 角标合并 + 标已读 |
| 侧栏收起/展开没效果 | ✅ SidebarLink 支持 collapsed（文字隐藏图标居中）+ 顶栏折叠按钮 |
| 横幅入口与分类编辑重复 | ✅ 删除独立横幅页/API，首页横幅改分类驱动 |
| 数据表样式统一 | ✅ 10 种规范宽度，8 张表全部收敛 |

**核心策略**：信息双向流动不静默 + 消费者购物最简便 + 后台像一个专业管理系统。

---

## 1. 后台推倒重设计：作用域化设计令牌（`.admin-theme`）

### 1.1 病根诊断

后台和店铺前台**共用同一套 CSS 变量**（`--radius: 0`、纯黑白、`shadow-card: none` 的 fashion-minimal 令牌），
所有 `rounded-md/lg/xl` 被压成直角，所有卡片阴影是 none——后台看起来像店铺的延伸，不是管理系统。

### 1.2 解法：作用域化令牌（前台一个像素不动）

```
:root         → 前台零圆角/纯黑白/无阴影（保持 shop.x.com 风格）
.admin-theme  → 后台独立令牌：8px 圆角 + 柔和多层阴影 + 冷调浅灰底 + 语义色微调
```

关键文件：
- `src/app/globals.css`：新增 `.admin-theme` / `.admin-theme.dark` 作用域，覆盖全部 CSS 变量；
  阴影改为变量驱动（`--shadow-card` 等），前台默认透明、后台柔和
- `tailwind.config.ts`：`boxShadow.card/soft/soft-lg` 改为 `var(--shadow-*)`
- `src/app/layout.tsx`：读 `x-pathname`，`/admin` 路由给 `<html>` 挂 `admin-theme`（SSR 零闪烁，Radix 弹层经 body 继承）
- `src/components/ui/card.tsx`：Card 自带 `shadow-card`（前台透明无视觉变化，后台自动柔和阴影）
- `src/components/admin/admin-shell.tsx`：全高白侧栏 + pill 激活态 + 毛玻璃顶栏 + 移动端抽屉侧栏
- `src/app/admin/login/page.tsx`：现代 SaaS 居中卡片
- `src/app/admin/page.tsx` / `admin-page-header.tsx`：统计卡/标题层级精修

### 1.3 验证

- DOM 实测：`--radius: .5rem`、浅灰底 `216 20% 96.5%`、卡片阴影 `rgba(0,0,0,0.04) 0 1px 2px + 0 2px 6px` ✅
- 前台隔离实测：`--radius: 0rem`、纯白底、html 无 admin-theme ✅

---

## 2. 分类落地页 hero 大横幅恢复（shop.x.com 对齐）

- `src/app/(shop)/products/page.tsx`：`?category=xxx` 时渲染**全宽 hero**：
  - 图：`Category.bannerImage` 优先（后台分类编辑上传），回落 `Category.image`
  - 透明顶栏叠图（HeaderShell `data-transparent` 机制，滚动后恢复实心黑——官方 is-solid）
  - `[ Name ]` 左下角标题（官方样式）
- 后台分类编辑文案更新：「大横幅（分类落地页顶部全宽图；前两个分类也用作首页横幅）」
- 实测：透明顶栏 t+4s 激活、滚动 400px 恢复实心黑 ✅

---

## 3. PDP 售罄订阅提醒去重

- 删除 `src/components/shop/notify-me-button.tsx`（死代码）及 PDP 顶部独立订阅入口
- 保留官方按钮位：售罄时 BuyPanel 的按钮自动变为 **Notify me**（`buy-now-button.tsx soldOut`），
  展开邮箱登记到货通知——与后台「到货提醒」管理页数据打通，不重复

---

## 4. 双向信息通知闭环（核心人性化优化）

### 4.1 前端动作 → 后台必知（新增 `notifyAdmins` 服务）

`src/server/services/notification.service.ts` 新增 `notifyAdmins()`：
通知所有活跃 ADMIN/SUPPORT 用户的站内通知。

| 触发点 | 通知内容 | 跳转 |
|--------|----------|------|
| 新订单（order.service createOrder） | 订单号 + 金额 | /admin/orders |
| 订单已付款（markOrderPaid） | 请安排发货 | /admin/orders |
| 退款申请（refund route） | 用户 + 订单 + 金额 + 原因 | /admin/refunds |
| 新用户注册（auth/register） | 用户名 + 邮箱 | /admin/users |
| 补货提醒（notify-me.service） | 商品 + 自动提醒 N 人 | /admin/notify-me |
| 降价提醒（price-alert.service） | 商品 + 新价 + 提醒 N 人 | /admin/products |

### 4.2 后台消息中心

- API：`src/app/api/admin/notifications/route.ts`（GET 列表 / PATCH 单条或全部已读，requireAdmin）
- 页面：`src/app/admin/notifications/page.tsx`（类型徽标 + 未读圆点 + 时间 + 「去处理 →」直达 + 标已读）
- 侧栏「运营管理」新增「消息中心」入口
- 顶栏 Bell 改造：角标 = 站内通知未读数 + 未读订单 + 待退款，点击进消息中心（每 30s 刷新）

### 4.3 后台处理 → 客户必知（既有链路确认完整）

- 发货：`order-shipped` 邮件 + 站内通知
- 退款批准/拒绝：`refund-update` 邮件 + 站内通知
- 订单支付成功 / 取消：邮件 + 站内通知
- 收藏降价：`price-drop` 邮件 + 站内通知
- **补货提醒：`restock` 邮件含完整商品卡**（大图 + 名称 + 卖点 + 规格 + 现价 + 划线原价 + CTA，与前端分享商品卡一致）

### 4.4 实测证据

- 注册新用户 → 消息中心立即出现「新用户注册」→ 全部已读 → 数据库未读清零 ✅
- 数据库确认：管理员通知表已有「新用户注册」「新退款申请」记录，链接正确 ✅
- 87/87 测试全绿（80 单测 + 7 集成）✅

---

## 5. 后台数据表统一规范

### 5.1 病根

8 张表用了 **20+ 种宽度类**（w-12 ~ w-[220px]），sticky 列半透明透字、状态 badge 换行、
操作按钮溢出盖列、空菜单弹出。

### 5.2 统一方案

| 列类型 | 统一宽度 | 说明 |
|--------|----------|------|
| 复选/图标 | `w-12` | 商品全选、分类图标 |
| 缩略图 | `w-14` | 商品图 |
| 短值 | `w-20` | 语种、库存、排序、角色 |
| 状态 | `w-24` | 徽章列（全表统一） |
| 金额 | `w-24 text-right` | 数字 |
| 编号/代码 | `w-[140px]` | 订单号、券码、动作 |
| 用户 | `w-[160px]` | 名称+邮箱 |
| 时间 | `w-[120px]` | 全表统一 |
| 长文本 | `min-w-0` | CellText 截断 |
| 操作列 | `sticky-col-right` | 按内容 w-[110~180px] |

### 5.3 关键修复

- `globals.css` 新增 `sticky-col-left/right` 工具类：**实心底（不透字）+ 1px 分隔线 + 表头 z-20 / 表体 z-10**，
  操作列 padding 收紧 8px（!important 覆盖 TableCell 默认 p-4，防按钮溢出）
- `badge.tsx`：全局加 `whitespace-nowrap`（状态永不换行）
- `data-table-actions.tsx`：只有主操作时不渲染空 `...` 菜单（桌面文字按钮/移动端图标按钮）
- `dropdown-menu.tsx`：主内容 z-50 → z-[60]（盖过抽屉）
- 涉及 7 张表：orders/users/coupons/products/notify-me/refunds/categories/audit-logs

### 5.4 实测

- 7 张表操作按钮零溢出（修复前 orders/users/coupons/categories 4 张溢出盖列）
- 行高统一 65-73px、语种/状态列单行 ✅

---

## 6. 侧栏收起/展开修复 + 重复入口清理

### 6.1 折叠修复

- **根因**：`SidebarLink` 没接收 `collapsed`，折叠后文字仍在 72px 窄栏里挤压溢出，看起来"没效果"
- 修复：SidebarLink 支持 collapsed（文字隐藏 + 图标居中）；**顶栏新增折叠按钮**（最直观）+ 保留侧栏底部按钮
- 实测：264px → 72px（文字隐藏图标居中）→ 264px ✅

### 6.2 横幅入口去重

- 独立「横幅」页的落地页大横幅 = 分类 `bannerImage`（分类编辑已有），纯属重复
- 删除：`src/app/admin/banners/page.tsx` + `src/app/api/admin/banners/route.ts` + 侧栏入口
- 首页横幅改为**分类驱动**：前两个分类的 `bannerImage`（回落 image）+ 分类名 + 分类链接
- 实测：首页 2 张横幅正常显示 ✅

---

## 7. 顺带修复的工程问题

1. **集成测试 500**：`shipping_methods` 表无种子 → 下单必 500。
   `prisma/seed.ts` 新增 `seedShippingMethods`（standard/express/cod），集成测试 6 失败 → 全绿
2. **vitest 超时**：`testTimeout: 30000 → 60000`、`hookTimeout: 60000 → 90000`（集成测试实际运行 22-27s 逼近旧上限）
3. **CSS 阴影 key 命名 bug**：tailwind boxShadow key `"shadow-popover"` 会生成 `shadow-shadow-popover` 类 → 改为 `popover`/`overlay`

---

## 8. 本次会话文件清单（核心）

**新增**
- `src/app/admin/notifications/page.tsx`（后台消息中心）
- `src/app/api/admin/notifications/route.ts`（管理员消息 API）
- `src/server/services/notification.service.ts`（含 `notifyAdmins`）

**删除**
- `src/app/admin/banners/page.tsx`、`src/app/api/admin/banners/route.ts`（横幅并入分类）
- `src/components/shop/notify-me-button.tsx`（PDP 订阅去重死代码）

**修改（核心）**
- `src/app/globals.css`（.admin-theme 令牌 + sticky 列工具类 + 阴影变量）
- `tailwind.config.ts`（boxShadow 变量化）
- `src/app/layout.tsx`（admin 路由挂 admin-theme）
- `src/components/admin/admin-shell.tsx`（侧栏/顶栏/折叠/消息中心/Bell）
- `src/components/ui/{card,table,badge,dropdown-menu}.tsx`
- `src/components/admin/{data-table-actions,admin-drawer,admin-page-header}.tsx`
- 8 张 admin 表格页（列宽统一）
- `src/server/services/{order,notify-me,price-alert,notification}.service.ts`
- `src/app/api/auth/register/route.ts`、`src/app/api/orders/[orderNumber]/refund/route.ts`
- `src/app/(shop)/{page,products/page,products/[slug]/page}.tsx`
- `prisma/seed.ts`（物流方式种子）、`vitest.config.ts`（超时）

---

## 9. 验证状态

- typecheck：0 错误（TS7016 为 next/*.d.ts 已知噪音）
- 单测：80/80 ✅
- 集成测试：7/7 ✅（含下单→支付→发票→退款全链路）
- 浏览器实测：后台令牌/hero 透明顶栏/侧栏折叠/消息中心/首页横幅/表格溢出 全部通过
