# 设计与交互规范（shop.x.com 对齐 · 已落地）

本文档描述商城前端的视觉设计系统与动态交互效果，与当前代码保持一致。
设计基准为 shop.x.com（SpaceXAI Shop，Shopify Impact 主题）的真实样式：
白底、黑头黑脚、常规字重 Helvetica、0 圆角、极简商品陈列。

> 实施状态：✅ 已全站落地（2026-02 设计整改）。验证脚本见
> `scripts/design-assertions.cjs`（DOM 令牌断言）与
> `scripts/design-vision-qa.cjs`（截图 → GLM 视觉模型走查）。

## 1. 设计令牌

| 令牌 | 值 | 落地位置 |
| --- | --- | --- |
| 页面背景 | `#FFFFFF` (`--background`) | `src/app/globals.css` |
| 正文/主色 | `#1C1C1C` / `#171717` (`--foreground` / `--primary`) | `globals.css` |
| 商品图底 | `#EFEFEF` (`--muted`) | `globals.css` |
| 描边/输入框 | `#DDDDDD` (`--border` / `--input`) | `globals.css` |
| 头部/页脚/横幅 | `#000000` (`--ink` + `bg-ink`) | `globals.css` + `tailwind.config.ts` |
| 头部文字 | 白色，链接 `opacity-65` hover 100% | 组件内透明度工具类 |
| 主按钮 | 黑底白字直角 | `ui/button.tsx` default variant |
| 描边按钮 | `.btn-sweep`：hover 黑色从左扫入（0.45s cubic-bezier） | `globals.css` components 层 |
| 圆角 | **全部 0**：`--radius: 0rem`，且 tailwind `borderRadius` 刻度整体映射到该变量 —— 历史 `rounded-md/lg/xl/2xl` 自动归零；`rounded-full` 仅保留给色卡/圆形快加钮 | `tailwind.config.ts` |
| 字体 | 系统 Helvetica/Arial 栈（中文回退 PingFang/雅黑），字重 400，**无 webfont**（零渲染阻塞、零构建期网络依赖） | `tailwind.config.ts` + `app/layout.tsx` |
| 阴影 | hairline-first：仅弹层用 `shadow-soft(-lg)`，卡片阴影为 none | `tailwind.config.ts` |

## 2. 布局（2026-02 二次整改：对 shop.x.com 逐像素复刻）

- **头部**：纯黑 65px 吸顶条（下滑隐藏/上滑出现）。**站名居左、无分类导航**
  （与 x.com 一致）；右侧依次 `币种(CNY ¥ ▾) / 搜索 / 登录 / 购物车 (n)`，
  文字白色 65% 透明度 hover 提亮。
- **首页**：两块**对半无缝** Collection 横幅（1440px 下各 720×404 ≈ 16:9）：
  `[ 分类名 ]` 左上角 22px 白色常规字重；`Shop All` 左下角 15px 白色文字链接
  （hover 下划线）；图片 grayscale + brightness .62 压暗保证任何素材都呈现
  深色极简气质；hover 慢速放大。下方居中 `All Products` 28px/400 → 三列网格。
- **商品列表页**：白底居中标题（28px/400）+ 件数；lg 以上左侧扁平筛选栏
  （active 黑色下划线），lg 以下顶部分类横滚条；排序下拉方角。
- **商品详情页**：左图右信息约 65/35；标题 22px/400、价格 15px 紧随其下；
  规格选择为**圆形药片**（rounded-full，x.com 同款）；加购/立即购买按钮
  高 46px 黑底白字直角通栏。
- **页脚**：黑色。一排居中 faded 链接（搜索/隐私/条款/退款/Cookie）+
  居中一行（币种选择器 · 版权 · ICP）。

### 与 x.com 的已知内容差异（非样式）
- 商品种类/摄影素材为本店自有内容（x.com 是人物品牌大片）；
- 头部货币显示 CNY ¥（站点结算币种），切换逻辑与 x.com 的 USD $ 选择器一致。

## 3. 动态效果（含 2026-02 新增交互）

| 元素 | 效果 | 实现 |
| --- | --- | --- |
| 预测式搜索 | 输入 ≥2 字符即 250ms 防抖查询 `/api/products`，弹层内渲染缩略图+名称+价格建议，可直达 PDP | `search-overlay.tsx`（客户端）+ 商品 API |
| 滚动显现 | 区块进入视口时 fade-up（700ms，交错延迟 90ms/卡） | `reveal.tsx` IntersectionObserver |
| 描边按钮 | hover 背景从左向右扫入（0.45s `cubic-bezier(.785,.135,.15,.86)`） | `.btn-sweep` |
| 文字链接 | 下划线从左划出 | `.link-underline` |
| 商品卡图片 | hover 双图 opacity 切换（0.2s） | 双 `next/image` + `group-hover:` |
| 快速加购 | hover 时右下白色圆钮滑入，图标旋转 90°，点击真实加购并弹抽屉 | 容器 translate/opacity + `cart:open` |
| Collection 横幅 | hover 图片慢速放大至 1.06（5s ease-out） | `duration-[5000ms] scale` |
| 详情主图 | 放大镜光标 + 点击全屏 lightbox；左缩略图切换 | `gallery.tsx` |
| 规格选择 | 颜色组 = 56px 圆形色块（选中黑环）；其他组 = 方角全宽下拉 | `buy-panel.tsx` |
| 购物车抽屉 | 加购后右侧滑入（300ms），数量/移除/去结算实时更新 | `cart-drawer.tsx` + `cart:open` |
| 吸顶头部 | 下滑隐藏、上滑出现 | `HeaderShell` transform |
| SEO | `/sitemap.xml`（商品+分类+静态页）、`/robots.txt`、PDP 注入 Product JSON-LD（价格/库存/评分） | `app/sitemap.ts` `app/robots.ts` 详情页 |
| 降级 | 全站动效支持 `prefers-reduced-motion` | `globals.css` 全局 media query |

## 3.5 鲁棒性约定（商用）

- 伪造/失效分类 slug → 静默回退"全部商品"，绝不 500（`products/page.tsx` 预校验）
- 规格组默认语义：**多值 = 可选规格**（颜色圆片/下拉），**单值 = 展示信息**；显式 `selectable` 声明优先（`types.ts#parseAttributes`）

## 4. 多币种显示

- 支持币种：CNY / USD / EUR / GBP / JPY / HKD / SGD / AUD / CAD。
- 汇率来源：[open.er-api.com](https://open.er-api.com)（`/api/currency/rates`
  服务端代理，6 小时缓存），离线回退内置参考汇率 `FALLBACK_RATES`。
- 选择写入 `currency` cookie（1 年）；订单与优惠券金额仍以 CNY 结算。
- 模块：`currency.ts` / `currency-server.ts` / `currency-provider.tsx` /
  `currency-select.tsx` / `api/currency/rates/route.ts`。

## 5. 设计 QA 工具链

```bash
node scripts/design-assertions.cjs    # DOM 级令牌断言（9 项：黑头/白底/直角/字体…）
export $(grep ZHIPU_API_KEY .env)     # 可选：GLM 视觉模型截图走查
node scripts/design-vision-qa.cjs     # 截图 home/products/login → 视觉审阅报告
```

## 6. 测试与部署

- 单元/集成测试：`npm run test` / `npm run test:integration`（Vitest）。
- E2E：`npm run test:e2e`（Playwright）。
- 构建：`npm run build`；Docker 部署见 `Dockerfile`、`docker-compose.yml`、
  `deploy/nginx.conf`。
