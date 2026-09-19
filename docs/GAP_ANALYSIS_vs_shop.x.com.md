# Ox Shopping vs shop.x.com —— 差距分析与商业交付就绪度评估

> 评估日期：2026-09-18 ｜ 评估方式：源码走查 + 实测命令 + 原站抓取 + 截图比对
> 评估范围：前台商城（shop）+ 管理后台（admin）+ 工程与部署链路
> **本次评估未修改任何业务代码。**

---

## 〇、结论摘要

**判定：不能直接投入商业交付使用。**

本项目是一份**完成度很高的商用级演示底座**（前台还原度 ≈ 90%、后端业务闭环完整、安全设计扎实），
但尚不具备**开门营业**的三个前提：**收得到钱、用得了料、跑得起来**。

差距不在页面。页面是它最强的一环；短板集中在**内容合规、支付通道、基础设施**三处，
外加一个**生产构建失败**的工程问题（3 个类型错误，改几行即可解决）。

| 维度 | 就绪度 | 说明 |
| --- | --- | --- |
| 视觉与交互还原 | 95 | 令牌级复刻，截图实测一致 |
| 认证与安全 | 88 | JWT 轮换/CSRF/限流/CSP/RBAC 齐备 |
| 购物车与结算 | 85 | 游客加购+登录合并；但结算强制登录 |
| 订单/退款/发票 | 85 | 状态机+退款审批+PDF 发票闭环 |
| 后台管理 | 80 | 18 个功能页，贴合本店流程 |
| 支付可收款 | 25 | 仅 Stripe 名义接入，未实测；其余全预留 |
| 基础设施 | 20 | 邮件/存储/Redis/CDN 全降级 |
| 内容与素材合规 | 10 | 商品数据与原站素材为直接镜像 |

---

## 一、实测证据（硬数据，非文档转述）

评估中实际执行并取到的结果：

| # | 项目 | 实测结果 | 与仓库文档宣称 |
| --- | --- | --- | --- |
| 1 | `npx tsc --noEmit`（= `npm run typecheck`） | **2 个错误**：`tests/e2e/shop.spec.ts:82` 与 `:96`（TS2769）。⚠️ **漏报**——增量缓存导致 `playwright.config.ts` 的错误未报出 | 文档称「typecheck 0 错误」— **不符** |
| 2 | `npx next build` | **失败**（`BUILD_EXIT=1`）：编译通过（5.2min），倒在类型校验，报 **3 个** TS2769（见 §1.2） | 文档称「CI 四任务全绿」— **不符** |
| 3 | `npx vitest run tests/unit` | **107/107 通过**（13 个文件） | 文档称「单测 144/144」— 数量漂移 |
| 4 | `PAYMENT_CHANNEL_ENC_KEY` | `.env` / `.env.example` / `.env.test` **三处均缺失**，代码回落 `dev-payment-channel-enc-key-change-me` | 支付渠道文档列为「生产必填」— **文档缺项** |
| 5 | 当前 `.env` 运行态 | `PAYMENT_MODE=mock`、`MAIL_PROVIDER=console`、`STORAGE_DRIVER=local`、`REDIS_ENABLED=false`、`SITE_URL=localhost` | — 全降级 |
| 6 | `git status` | 工作树含大量未提交改动（含 `tests/e2e/shop.spec.ts` 的 `M`） | 上述 2 个类型错误即为未提交改动引入 |

### 1.1 类型错误的影响面：**同时卡 CI 门禁与生产构建**

**错误成因（共 3 处，见 §1.2 实测输出）：**

```
playwright.config.ts:29   toHaveScreenshot.timeout —— 该属性不在 Playwright 类型定义里
tests/e2e/shop.spec.ts:82,96
  headers: { "Content-Type": "application/json", "x-csrf-token": csrf() }
                                  ↑ csrf() 返回 string | undefined
                                    （cookie .split("=")[1] + noUncheckedIndexedAccess: true）
```

**两条路径都会失败：**

| 门禁 | 命令 | 结果 |
| --- | --- | --- |
| CI「Lint & Typecheck」 | `npm run typecheck`（`tsc --noEmit`） | ❌ **失败**（报 2 个，**漏报** `playwright.config.ts`） |
| CI「Production Build」 | `npm run build`（`next build`） | ❌ **失败**（`Failed to type check.`，报全 3 个） |
| `next.config.js` | 未设 `typescript.ignoreBuildErrors` | 未做规避 |

即：**CI 两个 job 都会红**，文档宣称的「typecheck 0 错误」「CI 四任务全绿」
在当前工作树下均不成立。

**为什么 `tsc` 只报 2 个而 `next build` 报 3 个？**

`tsc --noEmit` 复用了仓库里的增量缓存 `tsconfig.tsbuildinfo`，漏掉了
`playwright.config.ts` 的错误；`next build` 的类型校验用独立缓存目录新建 program，
拿到的是完整结果。

已实测确认（关闭增量后全量重跑）：

```
$ npx tsc --noEmit --incremental false
错误条数: 3
   1 playwright.config.ts
   2 tests/e2e/shop.spec.ts
```

**这也意味着：只修那 2 个 `spec.ts` 错误后 `npm run typecheck` 会变绿，
但 `next build` 仍会失败** —— 必须连 `playwright.config.ts:29` 一起修。

> 修复成本仍然很低：三处都是类型层面的小问题，不涉及业务逻辑。

### 1.2 `next build` 实跑结果：**构建确实失败**（3 个类型错误）

清理 `.next` 后完整跑通一次 `npx next build`（Next.js 16.3.3 / Turbopack，8m08s）：

```
▲ Next.js 16.3.3 (Turbopack)
  Creating an optimized production build ...
✓ Compiled successfully in 5.2min
  Running TypeScript ...
✓ Finished writing to filesystem cache in 20.9s

playwright.config.ts(29,7): error TS2769: No overload matches this call.
    ... 'timeout' does not exist in type '{ animations? ... threshold? ... }'
tests/e2e/shop.spec.ts(82,9): error TS2769: ...
tests/e2e/shop.spec.ts(96,11): error TS2769: ...

Failed to type check.

BUILD_EXIT=1
```

**结论：编译阶段通过（5.2min），倒在类型校验阶段。**

**三个错误：**

| 文件 | 行 | 内容 |
| --- | --- | --- |
| `playwright.config.ts` | 29 | `toHaveScreenshot.timeout: 30_000` —— 该属性在当前 Playwright 版本的 `toHaveScreenshot` 类型里不存在 |
| `tests/e2e/shop.spec.ts` | 82 | `"x-csrf-token": csrf()` 返回 `string \| undefined` |
| `tests/e2e/shop.spec.ts` | 96 | 同上 |

**关于 Next 是否过滤测试文件诊断（重要澄清）：**

Next 的类型校验里确实存在这段过滤（`node_modules/next/dist/lib/typescript/runTypeCheck.js`）：

```js
const ignoreRegex = [
  /[\\/]__(?:tests|mocks)__[\\/]/,
  /(?<=[\\/.])(?:spec|test)\.[^\\/]+$/      // *.spec.* / *.test.*
];
```

但它**救不了这次构建** —— `playwright.config.ts` 的文件名既不含 `spec.` 也不含 `test.`，
**不在过滤范围内**，因此这个错误必然让构建失败。（`*.spec.ts` 的两个错误会被过滤掉，
但已不影响结论。）

**另一处需要注意的口径差异：**

| 检查方式 | 报出的错误数 | 原因 |
| --- | --- | --- |
| `npm run typecheck`（`tsc --noEmit`） | 2（仅 `shop.spec.ts`） | 走了仓库里的增量缓存 `tsconfig.tsbuildinfo`，**漏报了 `playwright.config.ts`** |
| `next build` 的类型校验 | 3 | 用独立缓存目录建新 program，**拿到完整结果** |

也就是说 **CI 的 typecheck 步骤本身也是漏报的** —— 它只报 2 个错误，
而真实情况是 3 个。修完这 2 个 `spec.ts` 错误后 typecheck 会变绿，
但 `next build` 仍会因为 `playwright.config.ts` 失败。

> **构建结论（最终）**：生产构建**失败**，根因是 3 个类型错误，
> 其中 `playwright.config.ts:29` 是唯一不被 Next 过滤、必然阻断构建的那个。
> 修复成本依然很低（三处类型问题，非业务逻辑）。

**关于沙箱的说明**：首次构建尝试被审计环境的 `safe-delete` 批量删除守卫拦下
（`SAFE_DELETE_BULK_CONFIRM_REQUIRED`，Next 清理旧 `.next` 产物时触发），
那是取证环境限制、与项目无关；清空 `.next` 后即可正常跑完并拿到上面的真实结果。

---

## 二、前台还原度对照（本项目最强项）

### 2.1 设计令牌

| 令牌 | 规范值 | 落地 |
| --- | --- | --- |
| 页面背景 | `#FFFFFF` | ✅ |
| 正文/主色 | `#1C1C1C` / `#171717` | ✅ |
| 商品图底 | `#EFEFEF` | ✅ |
| 描边 | `#DDDDDD` | ✅ |
| 头/脚/横幅 | `#000000` | ✅ |
| 圆角 | 全站 0（`--radius: 0rem`，历史 `rounded-*` 统一归零） | ✅ |
| 字体 | 系统 Helvetica/Arial 栈，字重 400，无 webfont | ✅ |
| 头部高度 | 65px 吸顶（下滑隐藏/上滑出现） | ✅ |
| 主按钮 | 46px 黑底白字直角 | ✅ |

### 2.2 逐页对照

| 页面 | 本项目实现 | 与原站一致性 |
| --- | --- | --- |
| 首页 | 双 collection 半宽无缝横幅（`aspect-[720/404]`）+ `[ Name ]` **左上** 22px + 其下 46px `Shop All` 描边钮（实测：名称字形带 y119..134、按钮盒 y169..214 / x48..156，与原站逐像素一致）+ hover 慢速放大（5s/1.06）→ 居中 `All Products` 28px → 3 列静态网格 | 高 |
| 列表页 `/products` | 无 `?category` → 居中 `Products` 标题；有 `?category` → 全宽 hero 横幅（透明顶栏叠图，横幅内无文字） | 高（原站 collection 页横幅亦无文字） |
| 详情页 | 左缩略图列（56×56 盒 / 52×52 图）+ 主图（放大镜/全屏灯箱）+ 右信息栏 **312px**（栅格 `7fr / 80px / 3fr`，1216 视口）；标题 22px、价格 15px；规格为圆形药片/方角下拉；46px 通栏加购；Size Chart 手风琴；You may also like | 高 |
| 购物车 | 空态文案与原站**逐字相同**（`Cart` / `Your cart is empty` / `Continue shopping`）；另有侧滑抽屉 | 高 |
| 页脚 | 黑色，faded 链接行（FAQ/搜索/无障碍声明/隐私/条款/退款/Cookie）+ 币种选择器 + 版权 | 高 |
| 登录 | 邮箱+密码 / 忘记密码 / 注册 | 与原站 `/account/login` 结构一致 |

### 2.3 有意为之的差异（非缺陷）

- **列表页无筛选/排序/分页**：与官方 `/collections/all` 一致，原站即为平铺。
  筛选/排序能力只落在 **`/search`**（`search-sidebar-filters.tsx`），不进列表页。
- **页脚 `Refund Policy`**：原站无此条。2026-09-18 按「一律以原站为准」移除，
  页脚恢复 7 条；`/policies/refund` 页面保留并经站内搜索可达。
- **商品内容不同**：本项目商品为本店自有目录（见第三节 P0-1，实际为原站镜像）。

> 完整的「有意差异」清单（含保留的增强、反面清单）见 `docs/DESIGN.md §2`
> 「与原站的有意差异（保留的增强 / 商业必需）」。

### 2.4 文档与实现的偏差 —— ✅ 已于 2026-09-18 全部修正

下表为审计时发现的文档失真项，**均已在 2026-09-18 的实现轮中改掉**，保留此表作追溯：

| 文档曾宣称 | 实际情况 | 处置 |
| --- | --- | --- |
| `DESIGN.md §3` PDP JSON-LD 含「价格/库存/**评分**」 | 全仓无 `aggregateRating` / `ratingValue`，评分不存在 | 已改为「名称/描述/图/分类/价格/库存」 |
| `PRODUCTION_CHECKLIST.md` 提及「券计数在支付时限校验 `usageLimit`」 | **无 Coupon 模型、无优惠券体系** | 已删除该子句，改为描述真实的支付幂等（回调/对账并发只生效一次） |
| `DESIGN.md §2` 列表页有左侧筛选栏 | 实际无（有意对齐官方） | 已改为「无件数/筛选/排序/分页；筛选仅用于 `/search`」 |
| `DESIGN.md §2` PDP 信息栏固定 336px | 实际 `.pdp-grid` = `7fr / 80px / 3fr`，1216 视口 → **312px** | 已按实测改写 |
| `DESIGN.md §2` 页脚链接列表 | 实际 7 条（含 `Your Privacy Choices`，无 `Refund Policy`） | 已按 `src/lib/footer-nav.ts` 改写；页脚已移除 `Refund Policy` 并对齐原站 |
| `DESIGN.md §3` 商品卡 hover 有「快速加购」圆钮 | 原站商品卡 hover 只换图；本项目亦**无** quick-add 代码 | 已删除该行并加入反面清单 |
| README/findings 称 typecheck 0 错误、单测 144 | 审计时实测 2 错误、单测 107 | `tsc --noEmit` 已修为 **EXIT=0**；`findings.md` 为开发日志，数字是当时的快照，不改写历史 |

---

## 三、商务能力差距矩阵（vs 原站 Shopify 平台）

| 能力 | 本项目 | shop.x.com（Shopify） | 影响 |
| --- | --- | --- | --- |
| 商品目录 | 32 件（**原站镜像**） | 22 件在售 | 见 P0-1 |
| 划线价/促销价 | ⚠️ 种子无 `compareAtPrice`（卡片代码支持，数据未填） | ✅ 有 compare-at 语义（HTML 带 `Sale price` 标签，但**渲染无划线**） | 低（视觉一致，语义缺失） |
| 尺码级库存 | ⚠️ schema 支持 `specStock`，**种子未填** | ✅ 变体级库存 | 中 |
| 优惠券/折扣码 | ✅ **已实现**（2026-09-18）：`Coupon`/`CouponRedemption`、结账试算、取消/退款回补、领券中心、后台 CRUD | ✅ 原生 | — |
| 商品评价/评分 | ❌ 无 `Review` 模型、无前台模块 | ❌ **原站同样没有**（2026-09-18 复核，见 §七） | **无**（非缺口） |
| 游客结账 | ✅ **已实现**（2026-09-18）：`POST /api/orders` 允许游客下单，`userId=null` + 签发 `accessToken` | ✅ Shopify 标准 Checkout 默认允许 | — |
| 游客加购 | ✅ localStorage `guest_cart` + `/api/cart/merge` 登录合并 | ✅ | — |
| 心愿单 / 礼品卡 / Newsletter / 博客 | ❌ 全无 | 部分支持 | 中 |
| 支付方式 | ⚠️ 仅 Stripe 名义「真实接入级」且**未实测**；alipay/wechat/bankcard/paypal 全 `isReady=false` | Shop Pay / Google Pay / PayPal / 卡 | **P0** |
| 税务 | ⚠️ 全局 `TAX_RATE=0`（含税口径），非按地区 | 按地区自动计算 | 中 |
| 物流 | ⚠️ 自建 `shipping_methods` 表 + 手填 `trackingCompany/Number` | 承运商对接 + 实时运费 | 中 |
| 多币种 | ⚠️ 展示层换算，**订单以 USD 结算** | 真实多币种结算 | 中 |
| 分析埋点 | ❌ 无 GA4 / Meta Pixel / `gtag` / `fbq` | ✅ | 中 |
| 邮件通知 | ⚠️ 模板齐备（react-email），但 `MAIL_PROVIDER=console` | ✅ 托管 | **P0** |
| 对象存储 | ⚠️ 支持 S3/R2/MinIO，当前 `local` 磁盘 | Shopify CDN | **P0** |
| 限流/缓存 | ⚠️ 代码就绪，当前 `REDIS_ENABLED=false`（内存降级，多副本穿透） | 平台内建 | 高 |
| SEO / i18n | ✅ `/zh` `/en` 路由级 locale、hreflang 交替、sitemap、JSON-LD（Organization/WebSite/Product） | ✅ | — |
| 法务页面 | ✅ 隐私/条款/退款/Cookie/无障碍声明，后台可双语编辑 | ✅ | — |
| 数据合规 | ✅ GDPR 导出 `/api/user/export`、删除申请、Cookie 横幅 | 平台支持 | — |

---

## 四、阻断项分级

### P0 —— 不解决就无法商用

**P0-1 内容与素材是原站镜像，商用构成侵权**

- `prisma/xcom-catalog.ts` 文件头自述：
  `AUTO-GENERATED by scripts/gen-xcom-seed.cjs — mirror of shop.x.com catalog`
- 由原站官方 `/products.json` 生成，**32 个商品的名称、slug、描述逐字复制**
- 涉及商标：`Grok`、`xAI`、`Macrohard`、`Colossus`、`X Collection`、`SpaceXAI`
- 商品图片直接取自原站：`public/images/xcom2/`（120 张）、`public/images/xcom/`（19 张），
  `public/` 合计 **116MB / 248 张图**
- `next.config.js` 仍将 `shop.x.com`、`cdn.shopify.com` 列入远程图源白名单
- 结论：**交付前必须整体替换品牌、商品、摄影素材与文案**，这不是"改改文案"的量级

**P0-2 收不到钱**

四个国内/国际渠道是**硬编码的预留级**，不是"配好就能用"：

```ts
// src/lib/payment/providers/alipay.ts:39
isReady() {
  // 预留级：参数组装 + RSA2 签名/验签已就绪，未接真实网关 HTTPS 下单
  return false;                      // ← 恒为 false
}
```

| 渠道 | 文件 | `isReady` | 下单行为 |
| --- | --- | --- | --- |
| 支付宝 | `providers/alipay.ts:68` | `return false` | `throw badRequest("…尚未接入真实下单请求")` |
| 微信支付 | `providers/wechat.ts:64` | `return false` | 同上 |
| 银行卡 | `providers/bankcard.ts:74` | `return false` | 同上 |
| PayPal | `providers/paypal.ts:64` | `return false` | 同上 |
| Stripe | `providers/stripe.ts:48` | `secretKey && webhookSecret` | **真实创建 Checkout Session** |
| 模拟支付 | `providers/mock.ts` | 恒可用 | 站内模拟支付页 |

- 唯一"真实接入级"的 Stripe **未经真实收款验证**（无测试记录）
- 当前 `PAYMENT_MODE=mock` → 全站走站内模拟支付页
- 结论：**当前状态下顾客无法完成一笔真实付款**

**P0-3 基础设施全降级**

| 项 | 当前 | 商用要求 |
| --- | --- | --- |
| 邮件 | `console`（打印日志 + 落盘 `.mail-out/`） | 真实 SMTP / Resend + 域名验证 |
| 存储 | `local` 磁盘 | S3 / R2 + CDN（否则不能横向扩容） |
| 限流缓存 | `REDIS_ENABLED=false`（内存降级） | Redis（多副本下内存版会被穿透） |
| CDN | 未配置 | `/_next/static`、`/uploads/*` 走 CDN |

**P0-4 生产构建失败（3 个类型错误）**

`npx next build` 实测 **`BUILD_EXIT=1`**：编译阶段通过，倒在类型校验 —— 详见 §1.2。

| 错误位置 | 内容 |
| --- | --- |
| `playwright.config.ts:29` | `toHaveScreenshot.timeout` 不在 Playwright 类型定义内 ← **唯一不被 Next 过滤、必然阻断构建的** |
| `tests/e2e/shop.spec.ts:82,96` | `csrf()` 返回 `string \| undefined` |

CI 的「Lint & Typecheck」与「Production Build」**两个 job 都会红**。

修复成本极低（三处类型问题，不涉及业务逻辑），但**在修好之前无法产出生产构建产物** ——
这是本清单里唯一"改几行就能解决"的阻断项，建议最先处理。

**P0-5 环境变量文档缺项**

`PAYMENT_CHANNEL_ENC_KEY` 未出现在 `.env.example`，而它是支付渠道配置的 AES-256-GCM 主密钥。
按文档配置生产环境会触发弱密钥拒启（或更糟：使用开发默认密钥加密渠道密钥）。

### P1 —— 影响转化与运营（2026-09-18 更新：1、2 已闭环）

1. ~~无优惠券/折扣码体系~~ → ✅ **已实现**（`Coupon`/`CouponRedemption` 模型、结账试算与
   下单事务内复算、取消/整单退款回补、`/coupons` 领券中心、`/account/coupons`、
   `/admin/coupons` 后台 CRUD；端到端 29/29 + 后台 8/8 通过）
2. ~~**结算强制登录**~~ → ✅ **已实现游客结账**（`POST /api/orders` 不再要求登录，
   订单 `userId=null` 落库并签发 `accessToken` 供免登录查单/开发票；
   无令牌访问订单详情与发票均被拦截）。
   原证据位置 `src/components/shop/checkout-flow.tsx:202-203` 已不再走跳登录分支。
3. ~~无商品评价/评分~~ → ❌ **撤销该条**：2026-09-18 复核确认**原站也没有评价体系**
   （见 §七），按「一律对齐原站」的口径**不应新增**。此前把它列为缺口，
   源于 `20260910042551_drop_reviews_coupons` 迁移注释里「shop.x.com 原站没有」
   这句话被反向采信 —— 该注释对**评价**的判断是对的，对**优惠券**的判断是错的。
4. 无分析埋点（GA4/Meta Pixel），无法衡量投放效果
5. 税务为全局常量，物流无承运商对接与实时运费
6. 多币种仅展示层，订单统一以 USD 结算
7. 无心愿单 / 礼品卡 / Newsletter / 内容营销

### P2 —— 细节与工程卫生

1. 种子未填 `compareAtPrice`（原站设了 compare-at 价，HTML 带 `Sale price` 标签；
   但**两边渲染都只有一行价格、无划线**，故视觉一致，仅语义/促销能力缺失）
2. 种子未填 `specStock` → 尺码级库存能力未启用
3. 单测数量与文档不符（107 vs 144）
4. `docs/DESIGN.md` 与 `PRODUCTION_CHECKLIST.md` 存在陈旧/失真描述（见 §2.4）
5. 全站页面 `force-dynamic`，无 ISR/静态化策略

---

## 五、交付路径建议（按优先级）

| 顺序 | 动作 | 性质 |
| --- | --- | --- |
| 1 | **替换全部品牌与商品素材**：自建目录、自有摄影、去除一切第三方商标 | 法务前置，不可跳过 |
| 2 | **打通一个真实支付渠道**：Stripe 最快（后台填 `sk_` / `whsec_` 即 `isReady=true`），并完成真实小额全链路验证 | 收款前置 |
| 3 | 配置 SMTP/Resend + S3/R2 + CDN + Redis | 基础设施 |
| 4 | 修复 **3 个**类型错误（`playwright.config.ts:29` + `shop.spec.ts:82,96`），恢复 `next build` 通过 | 工程门禁（改几行即可） |
| 5 | 在 `.env.example` 补 `PAYMENT_CHANNEL_ENC_KEY` 等缺失项 | 可运维性 |
| 6 | 按 `docs/PRODUCTION_CHECKLIST.md` 逐项过一遍（密钥、域名、备份、监控告警） | 上线闸门 |
| 7 | 业务补强：~~优惠券~~、~~游客结账~~（均已闭环）、~~评价~~（复核后确认原站无，不新增）、埋点 | 转化优化 |

---

## 六、可直接复用的结论

- **不要重写前台**。视觉与交互层已达标，是全项目质量最高的部分。
- **不要重写业务闭环**。订单状态机、退款审批、发票、通知、审计均已闭环并有测试覆盖。
- **要重做的是"输入"和"出口"**：输入的素材（合规）、出口的支付与邮件（变现）。
- 工程侧只需收口 2 个类型错误 + 补齐环境变量文档，成本极低但收益是"能否构建"。

---

## 七、复核：原站到底有没有「商品评价 / 评分」？（2026-09-18）

**结论：没有。** 本项目**不应**新增评价体系 —— 那会是偏离原站，而不是对齐原站。

### 为什么必须复核

`prisma/migrations/20260910042551_drop_reviews_coupons/migration.sql` 的注释写着：

```sql
-- 精简：删除 shop.x.com 原站没有的冗余功能（商品评价 Review + 优惠券 Coupon）
```

这句话把**两件事**绑在了一起，而它们的真假相反：

| 被删对象 | 注释的判断 | 事实 | 处置 |
| --- | --- | --- | --- |
| `coupons` / `coupon_redemptions` | 「原站没有」 | **错**（Shopify 原生支持折扣码） | 已恢复并实现（见 B4） |
| `reviews` | 「原站没有」 | **对** | 保持删除，不新增 |

教训：**一条注释里的多个论断要分开验证**，不能因为其中一条被推翻就把整条注释反过来采信。
本轮一度据「Shopify 原站两者都有」把评价也列为待补缺口 —— 这一步是错的。

### 取证（两条独立通道 × 两个商品）

1. **DOM 文本**（`r.jina.ai`，可读到真实 DOM 文本）
   - `/products/x-icon-t-shirt`（The Core Tee）
   - `/products/the-grok-hoodie`（The Grok Hoodie）
   - 检索 `review / reviews / rating / star / aggregateRating / Write a review /
     Be the first / feedback / judge.me / loox / okendo / yotpo / stamped` —— **零命中**。
2. **整页截图**（`image.thum.io`，`width/1200/fullpage/noanimate`，1200×1647）
   - 肉眼可读的完整区块顺序：header → 图库（2 缩略图 + 主图）→ 标题 `The Core Tee` →
     `$35.00` → 描述 → Size 下拉 → 数量步进器 → `Add To Cart` → `Size Chart` 折叠项 →
     `You may also like` → 页脚（7 链接 + `X Corp © 2024`）。
   - **无评价区、无星级、无「写评价」入口、无评价应用组件**。

两通道结论一致，且换第二个商品复核后仍然一致，故可定论。

### 顺带得到的 PDP 结构事实（可用于后续对齐核对）

- PDP 的 Size 选择器在原站是 **`<select>` 下拉**，不是一排按钮。
- `Size Chart` 是**折叠项**（带 `+`），不是常驻区块。
- 「You may also like」标题**居中**，是 10 件商品的轮播。
- 页脚链接 7 条，与本地已对齐的清单一致。

> 若后续仍要加评价功能，应作为**明确的产品决策**记录在
> `DESIGN.md §2「与原站的有意差异」`里，而不是当作「补齐缺口」悄悄加。

---

## 附录：本次评估所用证据

- 源码走查：`prisma/schema.prisma`、`prisma/xcom-catalog.ts`、`prisma/seed.ts`、
  `next.config.js`、`tsconfig.json`、`src/app/(shop)/page.tsx`、
  `src/app/(shop)/products/page.tsx`、`src/components/shop/product-card.tsx`、
  `src/components/shop/cart-provider.tsx`、`src/components/shop/checkout-flow.tsx`、
  `src/lib/env.ts`、`src/server/services/order.service.ts`、`docs/*.md`
- 实测命令：`npx tsc --noEmit`、`npx vitest run tests/unit`、`npx next build`、
  `curl localhost:3000`
- 原站抓取：`shop.x.com` 首页 / `/collections/all` / `/products/the-xai-hoodie` / `/cart` / `/account/login`
- 截图比对：`agent-browser` 1440×900，本地首页 / 列表页 / 详情页 / 购物车
