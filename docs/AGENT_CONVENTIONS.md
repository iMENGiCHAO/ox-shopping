# 星辰商城 — 子代理开发契约（务必先读本文件再动手）

项目根目录：/Volumes/Time Machine/DeepSeek/ecommerce
本项目为 Next.js **16** App Router（Turbopack）+ TypeScript 严格模式 + Tailwind + shadcn/ui 风格。
（注意：不再是 Next 14；中间件文件为 `src/proxy.ts`，Next 16 约定，见 `node_modules/next/dist/docs/`。）
开始前请先浏览以下文件了解既有代码（用 read 工具）：
- src/lib/api.ts、src/lib/errors.ts、src/lib/utils.ts、src/lib/constants.ts
- src/lib/auth/session.ts、src/lib/auth/csrf.ts、src/lib/auth/password.ts、src/lib/auth/jwt.ts
- src/lib/validations/*.ts（auth/address/product/cart-order/admin）
- src/server/services/*.ts（cart/product/order/stats service）
- src/lib/fetch-client.ts（客户端请求封装，含 CSRF）
- src/types/api.ts（SessionUser、ApiResponse、Paginated 类型）
- src/lib/order-status.ts（ORDER_STATUS_LABELS、canTransition 等）
- src/lib/mail/index.ts（sendMail 签名）、src/lib/payment/stripe.ts、src/lib/payment/mock.ts
- src/lib/storage/index.ts、src/lib/invoice.ts、src/lib/cache.ts、src/lib/audit.ts、src/lib/rate-limit.ts
- src/proxy.ts（请求 ID / CSP / CSRF 与 /admin 守卫，不要绕过）

## 铁律
1. 所有 API 路由统一用 apiHandler 包装：`export const POST = apiHandler(async (req, ctx) => {...})`；
   成功响应用 json(data)（信封 { data }）或 jsonPaginated；错误直接 `throw badRequest("...")` / `throw unauthorized()` / `throw notFound()` / `throw forbidden()` 等（来自 @/lib/errors），不要手动 return NextResponse.json 错误。
2. 动态参数从 ctx.params 取值必须容错：`const id = Array.isArray(ctx.params.id) ? ctx.params.id[0] : ctx.params.id`。
3. 请求体校验一律用 readJson(req, schema)；查询参数用 searchParam(new URL(req.url).searchParams, "x")。
4. 认证：requireUser()/requireAdmin()/requireStaff()（@/lib/auth/session）。
5. 敏感操作写审计日志：await audit({ userId, action, entity, entityId, meta, req })。
6. 认证限流：rateLimit({key, limit, windowSeconds}) → 429 用 throw rateLimited()。login: 5次/分/IP+邮箱；register/forgot: 3次/分/IP；reset: 5次/分/IP；refresh: 60次/分/IP。
7. 服务端组件/路由可 import server-only 模块（prisma、service、lib）；客户端组件只允许 import："use client" 组件、src/lib/fetch-client、src/lib/utils（cn/formatMoney）、src/lib/order-status（纯函数）、src/lib/constants。
8. 所有页面 UI 文案中文。加载态用 Skeleton（@/components/ui/skeleton），错误提示用 sonner toast（import { toast } from "sonner"）。
9. 表单用 react-hook-form + zodResolver（@hookform/resolvers/zod），组件 @/components/ui/form。
10. 不要修改 src/proxy.ts、prisma/schema.prisma、src/app/layout.tsx、src/app/globals.css。如发现这些文件有 bug，在最终汇报里列出，不要擅自修改。（注：src/lib/、src/server/services/ 属于可改范围，但涉及资金/订单承重墙见 docs/ARCHITECTURE_REVIEW_2026-09.md §1。）
11. 不要创建 package.json 依赖（不安装新包）。只用已安装依赖：next、react、react-dom、@prisma/client、prisma、zod、jose、bcryptjs、ioredis、stripe、resend、nodemailer、@react-email/components、@react-email/render、@aws-sdk/client-s3、@aws-sdk/s3-request-presigner、pdfkit、pino、recharts、react-hook-form、@hookform/resolvers、lucide-react、sonner、date-fns、clsx、tailwind-merge、class-variance-authority、@radix-ui/*、isomorphic-dompurify、server-only、@sentry/node、sharp、tsx、dotenv。
12. Next 16：客户端组件不能是 async；App Router 下 `page.tsx` 的 `searchParams`/`params` 是 **Promise**（须 `await`）。不得使用 React 19 不支持的老 API。
13. 图片用 next/image；种子图域名 picsum.photos 已加入白名单。
14. 类型严格模式（strict + noUncheckedIndexedAccess）：数组索引访问需判空或 !。
15. 完成后运行 `npx tsc --noEmit 2>&1 | head -n 40`（若 node_modules 尚未装好则跳过），修复你能修复的类型错误。运行前先 `npx prisma generate`（如 node_modules/.prisma 不存在）。

## 数据库模型速查（prisma/schema.prisma 已存在）
User(email unique, passwordHash, name, role: ADMIN|CUSTOMER|SUPPORT, status: ACTIVE|DISABLED, emailVerified, lastLoginAt)
Address(userId, recipientName, phone, province, city, district, detail, isDefault)
RefreshToken(userId, tokenHash unique, expiresAt, revokedAt, replacedBy)
Category(name, slug unique, description, image, parentId 自关联, sortOrder, isActive)
Product(name, slug unique, sku unique, price Decimal, compareAtPrice?, costPrice?, stock, soldCount, images Json[], attributes Json[], status: DRAFT|ACTIVE|ARCHIVED, categoryId)
CartItem(userId, productId, quantity, @@unique([userId, productId]))
Order(orderNumber unique, userId, status: PENDING_PAYMENT|PAID|PROCESSING|SHIPPED|DELIVERED|CANCELLED|REFUNDED, subtotal/shippingFee/tax/discount/total Decimal, currency, addressSnapshot Json, paymentProvider, paymentId, trackingCompany, trackingNumber, note, paidAt/shippedAt/deliveredAt/cancelledAt/refundedAt)
OrderItem(orderId, productId?, productName, productImage?, sku, price, quantity, subtotal)
Review(userId, productId, orderItemId? unique, rating 1-5, title?, comment, images Json[], isVerifiedPurchase, isHidden, @@unique([userId, productId]))
Favorite(userId, productId, @@unique([userId, productId]))
Coupon(code unique, type: PERCENTAGE|FIXED|FREE_SHIPPING, value, minSpend, maxDiscount?, startsAt, endsAt, usageLimit, usedCount, isActive)
CouponRedemption(couponId, userId, orderId, discountAmount, @@unique([couponId, orderId]))
Refund(orderId, userId, reason, amount, status: REQUESTED|APPROVED|REJECTED|REFUNDED, adminNote?)
AuditLog(userId?, action, entity?, entityId?, meta Json?, ip?, userAgent?)
SiteSetting(key pk, value Json)

## 业务服务（src/server/services/）已提供，直接复用：
- cart.service: getCart/addToCart/updateCartItem/removeCartItem/clearCart/mergeLocalCart
- product.service: listProducts(params)/getProductBySlug/getProductById/listCategoryTree/getCategoryBySlug/getRatingStats/listReviews/getRelatedProducts/getHomeData/listActiveCoupons
- order.service: createOrder(input)/createPaymentUrl(order, email)/markOrderPaid(orderNumber, paymentId?)/cancelOrder(order, byUserId?)/expireStaleOrders()/updateOrderStatus(order, to, actor, extra?)/getOrderByNumber/getOrderById/assertOrderOwner/computeCouponDiscount/findUsableCoupon；类型 OrderWithItems
- stats.service: getAdminStats()

## 种子账号
admin@example.com / Admin@123456（ADMIN）；user@example.com / User@123456（CUSTOMER）；support@example.com / Support@123456（SUPPORT）
优惠券：WELCOME10（9折，满100，最高减200）、SAVE50（满300减50）、FREESHIP（满99免运费）
