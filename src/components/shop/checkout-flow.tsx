"use client";

import * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, Loader2, MapPin, Truck, CreditCard, X } from "lucide-react";
import { apiFetch } from "@/lib/fetch-client";
import { useCurrency } from "@/components/shop/currency-provider";
import { allocateRateAmounts, formatAmount } from "@/components/shop/currency";
import { useShopLang, useT } from "@/components/shop/lang-provider";
import { formatSpecValues, type ShopAddress } from "@/components/shop/types";
import { COUNTRIES, DEFAULT_COUNTRY, countryStates, getCountry } from "@/lib/countries";
import { couponReasonMessage, type CouponRejectReason } from "@/lib/coupon";
import { fetchGuestCartLines, hasLoggedInCookie } from "@/lib/guest-cart";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  AddressLookupIcon,
  CheckoutBreadcrumb,
  CheckoutInput,
  CheckoutLogo,
  CheckoutSelect,
  CK,
  EmailHintIcon,
  QtyBadge,
  SummaryRow,
  type CheckoutStep,
} from "@/components/shop/checkout-ui";

/**
 * 结账流程（客户端）。
 *
 * 形态对齐原站 上游参考站 结账页（Shopify checkout）：
 *   - **两栏**：左栏 = 表单（面包屑 → 分步表单 → Return to cart / 主按钮）；右栏 = 订单摘要
 *     （明细 → 折扣码 → Subtotal / Shipping / Total），右栏底色 rgb(245,245,245) 且铺满视口高。
 *   - **四步**：Cart › Information › Shipping › Payment › Review，面包屑可点回退。
 *   - **游客可下单**：Contact 段只有 Email + `Sign in` 链接，不强制登录；
 *     登录用户也不强制用地址簿，地址一律在结账页内联填写（与原站一致）。
 *   - **折扣码**：右栏「Discount code + Apply」，试算走后端（金额按 DB 现价重算，前端不可篡改）。
 *
 * 栅格比例（原站实测，布局宽 1216）：
 *   左栏留白 9.65% | 表单 41.04% | 栏间距 3.48% | 右栏 45.83%
 *   右栏内部：左内缩 3.5% | 内容 32.4% | 右侧余量 10%
 * 4 个视口宽度（1016/1116/1216/1296）实测比例一致（误差 <0.5%），故用 fr 精确复现。
 *
 * 移动端（<1000px）原站形态：单列，顶部是「Order summary ⌄ + 总额」折叠条，
 * 表单整宽铺开；因此右栏在移动端排到表单**之前**（靠 order-first），展开后显示摘要。
 */
interface CartLineLite {
  id: string;
  productId: string;
  name: string;
  slug: string;
  image: string | null;
  price: number;
  stock: number;
  status: string;
  quantity: number;
  subtotal: number;
  attributes?: { name: string; value: string }[];
  isPresale?: boolean;
}

interface PreviewProduct {
  id: string;
  name: string;
  slug: string;
  images: string[] | null;
  price: number | string;
  stock: number;
  status: string;
  isPresale?: boolean;
}

interface ShippingMethodLite {
  id: string;
  code: string;
  name: string;
  nameEn: string | null;
  description: string | null;
  descriptionEn: string | null;
  fee: number;
  freeOver: number;
  isCashOnDelivery: boolean;
  etaZh: string | null;
  etaEn: string | null;
}

interface PayChannel {
  code: string;
  name: string;
  available: boolean;
  currencyMismatch?: boolean;
}

/** 结账页收货地址（字段与原站结账页一致，见 @/lib/validations/cart-order 的 checkoutAddressSchema） */
interface CheckoutAddress {
  country: string;
  firstName: string;
  lastName: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  phone: string;
}

const EMPTY_ADDRESS: CheckoutAddress = {
  country: DEFAULT_COUNTRY,
  firstName: "",
  lastName: "",
  line1: "",
  line2: "",
  city: "",
  state: "",
  postalCode: "",
  phone: "",
};

/** 游客「保存信息以便下次使用」的本地缓存键（登录用户走地址簿，不用这个） */
const GUEST_ADDRESS_KEY = "checkout-guest-address";

export interface CheckoutFlowProps {
  buyNow?: string;
  quantity?: string;
  /** 立即购买携带的下单规格(JSON 字符串) */
  attrs?: string;
  /** 品牌标志（服务端读站点设置注入） */
  logoUrl: string;
  /** 标志是否需要反相（白底结账页 + 白色图案的默认 Logo） */
  logoInvert: boolean;
  /** 当前是否已登录（服务端判定，避免客户端闪烁） */
  signedIn: boolean;
  /** 登录用户的邮箱（预填 Contact 段） */
  defaultEmail: string;
  /** 登录用户的已保存地址（可一键带入内缀表单） */
  savedAddresses: ShopAddress[];
  /**
   * 税率（0–1，服务端 TAX_RATE 环境量注入）。0=价格含税（VAT included），
   * 不显示 Tax 行；>0 时结算摘要与服务端 computeOrderAmounts 同公式补 Tax 行
   * （tax = subtotal × rate），杜绝「订单页有税、结算页没税」的前后端分叉。
   */
  taxRate: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** 邮箱格式校验（与 zod 的 .email() 同口径的宽松实现，用于行内提示） */
function isEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

export function CheckoutFlow({
  buyNow,
  taxRate,
  quantity,
  attrs,
  logoUrl,
  logoInvert,
  signedIn,
  defaultEmail,
  savedAddresses,
}: CheckoutFlowProps) {
  const { format, code: currencyCode, rate } = useCurrency();
  const t = useT();
  const { lang } = useShopLang();

  const [phase, setPhase] = useState<"loading" | "ready" | "empty">("loading");
  const [step, setStep] = useState<CheckoutStep>("information");
  const [lines, setLines] = useState<CartLineLite[]>([]);
  const [contactEmail, setContactEmail] = useState(defaultEmail);
  const [addr, setAddr] = useState<CheckoutAddress>(EMPTY_ADDRESS);
  const [saveInfo, setSaveInfo] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [shippingMethods, setShippingMethods] = useState<ShippingMethodLite[]>([]);
  const [shippingMethod, setShippingMethod] = useState("");
  const [note, setNote] = useState("");
  const [payChannels, setPayChannels] = useState<PayChannel[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const [couponInput, setCouponInput] = useState("");
  const [applied, setApplied] = useState<{
    code: string;
    discountUsd: number;
    freeShipping: boolean;
  } | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponBusy, setCouponBusy] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  /** 最近一次「券试算」所用的物流方式：物流变了要重算（免邮券的减免额 = 运费） */
  const couponForMethodRef = useRef<string | null>(null);

  const country = getCountry(addr.country);
  const states = countryStates(addr.country);
  const needsPhone = country.phone;

  /* ---------------- 数据加载 ---------------- */

  const loadCart = useCallback(async () => {
    // 游客（无登录提示 cookie）：读 localStorage 本地车 + 公开接口补全商品信息。
    // /api/cart 对游客返回 401，而原站结账页本身不要求登录（Shopify 游客结账），
    // 故此处分流，避免整页被判为「购物车为空或加载失败」。
    if (!hasLoggedInCookie()) {
      const guestLines = await fetchGuestCartLines();
      if (guestLines.length === 0) {
        setLines([]);
        return;
      }

      // guest-cart 的共享读取器早于 isPresale 上线，先以 preview 再补一次商品谓词。
      // 这样游客结账与购物车对「stock=0 的预售仍可购」保持同一口径；补全失败时保留基础行，
      // 不让一次元数据刷新失败把整个结账页打成空态。
      try {
        const ids = [...new Set(guestLines.map((line) => line.productId))].join(",");
        const data = await apiFetch<{ products: PreviewProduct[] }>(
          `/api/cart/preview?ids=${encodeURIComponent(ids)}`,
        );
        const products = new Map((data.products ?? []).map((product) => [product.id, product]));
        setLines(
          guestLines.map((line) => ({
            ...line,
            isPresale: products.get(line.productId)?.isPresale ?? line.isPresale,
          })),
        );
      } catch {
        setLines(guestLines);
      }
      return;
    }
    const res = await apiFetch<{ items: CartLineLite[] }>("/api/cart");
    setLines(
      (res.items ?? []).map((it) => ({
        id: it.id,
        productId: it.productId,
        name: it.name,
        slug: (it as { slug?: string }).slug ?? "",
        image: it.image ?? null,
        price: (it as { price: number }).price,
        stock: (it as { stock: number }).stock,
        status: (it as { status: string }).status,
        quantity: it.quantity,
        subtotal: it.subtotal,
        attributes: it.attributes,
        isPresale: (it as { isPresale?: boolean }).isPresale,
      })),
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // 物流方式（DB 配置，后台可改）
        try {
          const shipRes = await apiFetch<{ methods: ShippingMethodLite[] }>(
            "/api/shipping-methods",
          );
          if (cancelled) return;
          const methods = shipRes.methods ?? [];
          setShippingMethods(methods);
          if (methods.length > 0) setShippingMethod((prev) => prev || methods[0]!.code);
        } catch (err) {
          console.warn("Failed to load shipping methods", err);
        }

        // 购物袋 / 立即购买单品
        if (buyNow) {
          const data = await apiFetch<{ products: PreviewProduct[] }>(
            `/api/cart/preview?ids=${encodeURIComponent(buyNow)}`,
          );
          if (cancelled) return;
          const product = data.products?.[0];
          if (!product) {
            setPhase("empty");
            return;
          }
          const qty = Math.min(Math.max(1, Number(quantity) || 1), 99);
          const price = Number(product.price) || 0;
          let attributes: { name: string; value: string }[] | undefined;
          try {
            const parsed = attrs ? (JSON.parse(attrs) as unknown) : null;
            if (Array.isArray(parsed)) {
              attributes = parsed.filter(
                (a): a is { name: string; value: string } =>
                  !!a &&
                  typeof a === "object" &&
                  typeof (a as { name?: unknown }).name === "string" &&
                  typeof (a as { value?: unknown }).value === "string",
              );
            }
          } catch {
            attributes = undefined;
          }
          setLines([
            {
              id: product.id,
              productId: product.id,
              name: product.name,
              slug: product.slug,
              image: Array.isArray(product.images) ? (product.images[0] ?? null) : null,
              price,
              stock: product.stock,
              status: product.status,
              quantity: qty,
              subtotal: round2(price * qty),
              attributes,
              isPresale: product.isPresale,
            },
          ]);
        } else {
          await loadCart();
        }
        if (!cancelled) setPhase("ready");
      } catch (err) {
        if (cancelled) return;
        console.warn("Failed to load checkout data", err);
        setPhase("empty");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buyNow, quantity, attrs]);

  // 支付渠道（仅含可用状态，无密钥）。国内网关仅支持 CNY，USD/EUR 下置灰并提示。
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch<{ channels: PayChannel[] }>(
          `/api/payment/channels?currency=${currencyCode}`,
        );
        if (cancelled) return;
        const list = res?.channels ?? [];
        setPayChannels(list);
        const first = list.find((c) => c.available);
        setSelectedChannel((prev) => prev ?? (first ? first.code : null));
      } catch {
        // 渠道加载失败：保持 null → 下单走现有 mock 兜底，不阻断结算
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currencyCode]);

  // 游客：回填上次勾选「保存信息」时留在本机的地址（登录用户走地址簿，不读本地）
  useEffect(() => {
    if (signedIn) return;
    try {
      const raw = window.localStorage.getItem(GUEST_ADDRESS_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as Partial<CheckoutAddress> & { email?: string };
      setAddr((prev) => ({ ...prev, ...saved, country: saved.country || prev.country }));
      if (saved.email) setContactEmail((prev) => prev || saved.email!);
    } catch {
      // 本地缓存损坏：忽略，不影响结算
    }
  }, [signedIn]);

  /* ---------------- 金额 ---------------- */

  const subtotal = useMemo(() => round2(lines.reduce((s, l) => s + l.subtotal, 0)), [lines]);
  const currentMethod = shippingMethods.find((m) => m.code === shippingMethod);

  // 货到付款运费不计入订单总额（发货时收）
  const baseShipping = currentMethod?.isCashOnDelivery ? 0 : (currentMethod?.fee ?? 0);
  const freeOver = currentMethod?.freeOver ?? 0;
  // ⚠️ 口径必须与服务端 shipping.service 一致：按**折前** subtotal 判断免邮
  const freeShippingByThreshold = freeOver > 0 && subtotal >= freeOver;
  // ⚠️ 税费口径：当前 TAX_RATE=0（价格含税，对齐 上游参考站 欧盟站），故不显示 Tax 行。
  // 与服务端 order.service 的 tax 计算对应；若启用 TAX_RATE>0 需同步在此补 Tax 行。
  const shippingFee = freeShippingByThreshold ? 0 : baseShipping;
  const discountUsd = applied?.discountUsd ?? 0;
  // 税费（口径与服务端 computeOrderAmounts 完全一致：折前小计 × 税率）。
  // TAX_RATE=0（价格含税）时恒为 0，Tax 行不显示 —— 与订单详情页同规则。
  const taxUsd = round2(subtotal * taxRate);
  // 原站结账页在 Information 步显示「Shipping: Calculated at next step」，且 Total 仍等于
  // 小计（实测：Subtotal $70.00 / Total USD $70.00，运费未计入）。选定配送方式后才计入运费。
  // 若此步就把默认运费加进 Total，会出现「Shipping 行说未计算、Total 却已多一笔」的自相矛盾。
  const shippingKnown = step !== "information";
  // 说明：USD 口径的 `total` 不再单独保留 —— 展示一律走下方 shown（分配后用户币种值），
  // 避免出现「同一屏两个总额」的口径分叉（服务端落库同样以 allocateRateAmounts 为准）。
  const toFreeShipping = freeOver > 0 && subtotal < freeOver ? round2(freeOver - subtotal) : 0;

  // 汇总区展示值：与服务端落库（order.service → allocateRateAmounts）共用同一分配规则，
  // 保证「各明细之和 = 总额」且与实付一致（各分量独立舍入会出现明细和差 1 分）。
  // 说明：刻意**不包 useMemo** —— 纯整数分运算、开销可忽略，而 React Compiler 会拒绝
  // 保留依赖了渲染期派生值（shippingFee 等）的手工 memo（lint 报 Compilation Skipped）。
  const shown = allocateRateAmounts(
    {
      subtotal,
      shipping: shippingKnown ? shippingFee : 0,
      tax: taxUsd,
      discount: discountUsd,
    },
    rate,
  );
  const showUser = (userAmount: number) => formatAmount(userAmount, currencyCode);

  /** 下单/试算用的条目（与服务端 orderItemInputSchema 同形） */
  const orderItems = useCallback(
    () =>
      lines.map((l) => ({
        productId: l.productId,
        quantity: l.quantity,
        attributes: l.attributes && l.attributes.length > 0 ? l.attributes : undefined,
      })),
    [lines],
  );

  /* ---------------- 折扣码 ---------------- */

  const applyCoupon = useCallback(
    async (rawCode: string) => {
      const code = rawCode.trim();
      if (!code) return;
      setCouponBusy(true);
      setCouponError(null);
      try {
        const res = await apiFetch<{
          ok: boolean;
          quote?: {
            discountUsd: number;
            coupon: { code: string; freeShipping: boolean } | null;
          };
          reason?: CouponRejectReason;
          message?: string;
        }>("/api/coupons/apply", {
          method: "POST",
          body: JSON.stringify({
            code,
            items: orderItems(),
            shippingMethod,
            contactEmail: contactEmail.trim() || null,
          }),
        });
        if (res.ok && res.quote) {
          setApplied({
            code: res.quote.coupon?.code ?? code,
            discountUsd: res.quote.discountUsd,
            freeShipping: !!res.quote.coupon?.freeShipping,
          });
          couponForMethodRef.current = shippingMethod;
        } else {
          setApplied(null);
          setCouponError(res.message ?? couponReasonMessage("NOT_APPLICABLE", t));
        }
      } catch (err) {
        setApplied(null);
        setCouponError(
          err instanceof Error ? err.message : couponReasonMessage("NOT_APPLICABLE", t),
        );
      } finally {
        setCouponBusy(false);
      }
    },
    [orderItems, shippingMethod, contactEmail, t],
  );

  // 物流方式变了要重算券：免邮券的减免额就是运费，不重算会显示错价。
  useEffect(() => {
    if (!applied) return;
    if (couponForMethodRef.current === shippingMethod) return;
    void applyCoupon(applied.code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shippingMethod]);

  const removeCoupon = () => {
    setApplied(null);
    setCouponInput("");
    setCouponError(null);
    couponForMethodRef.current = null;
  };

  /* ---------------- 分步校验 ---------------- */

  /** 校验 Information 步；返回字段错误表（空对象 = 通过） */
  const validateInformation = (): Record<string, string> => {
    const errs: Record<string, string> = {};
    if (!signedIn) {
      if (!contactEmail.trim()) errs.contactEmail = t("Please enter your email");
      else if (!isEmail(contactEmail)) errs.contactEmail = t("Please enter a valid email address");
    }
    if (!addr.firstName.trim()) errs.firstName = t("Please fill in the shipping address");
    if (!addr.lastName.trim()) errs.lastName = t("Please fill in the shipping address");
    if (!addr.line1.trim()) errs.line1 = t("Please fill in the shipping address");
    if (!addr.city.trim()) errs.city = t("Please fill in the shipping address");
    if (!addr.state.trim()) errs.state = t("Please fill in the shipping address");
    if (!addr.postalCode.trim()) errs.postalCode = t("Please fill in the shipping address");
    // 手机号只在所选国家/地区要求时必填（原站的分国别表单行为）
    if (needsPhone && !addr.phone.trim()) errs.phone = t("Please fill in the shipping address");
    return errs;
  };

  /** 勾选了「保存信息以便下次使用」时落库/落本机（不阻断主流程） */
  const persistAddressIfRequested = async () => {
    if (!saveInfo) return;
    if (signedIn) {
      const recipientName = `${addr.firstName} ${addr.lastName}`.trim();
      const duplicate = savedAddresses.some(
        (a) =>
          a.recipientName === recipientName &&
          a.detail === addr.line1 &&
          a.city === addr.city &&
          a.province === addr.state,
      );
      if (duplicate) return;
      try {
        await apiFetch("/api/user/addresses", {
          method: "POST",
          body: JSON.stringify({
            recipientName,
            phone: addr.phone.trim() || "000000",
            province: addr.state,
            city: addr.city,
            // 地址簿的 district 为必填；结账页西式表单没有「区/县」，用城市兜底保证结构完整
            district: addr.city,
            detail: addr.line1,
            line2: addr.line2.trim() || null,
            country: addr.country,
            postalCode: addr.postalCode,
            isDefault: savedAddresses.length === 0,
          }),
        });
      } catch {
        // 保存失败不阻断下单：地址已随订单快照保存，地址簿只是便利功能
      }
      return;
    }
    try {
      window.localStorage.setItem(
        GUEST_ADDRESS_KEY,
        JSON.stringify({ ...addr, email: contactEmail.trim() }),
      );
    } catch {
      // 隐私模式 / 存储配额不足：忽略
    }
  };

  const goNext = async () => {
    if (step === "information") {
      const errs = validateInformation();
      setFieldErrors(errs);
      if (Object.keys(errs).length > 0) {
        toast.error(Object.values(errs)[0]!);
        return;
      }
      void persistAddressIfRequested();
      setStep("shipping");
      return;
    }
    if (step === "shipping") {
      if (!shippingMethod) {
        toast.error(t("Please select a shipping method"));
        return;
      }
      setStep("payment");
      return;
    }
    if (step === "payment") {
      // COD（货到付款）跳过支付环节：现金交易无线上支付渠道可选，
      // 服务端会按 COD 创建订单（直接进入待处理），不生成支付地址
      if (currentMethod?.isCashOnDelivery) {
        setStep("review");
        return;
      }
      // 没有任何可用渠道时不允许拦路：下单走服务端 mock 兜底
      const hasAvailable = payChannels.some((c) => c.available);
      if (hasAvailable && !selectedChannel) {
        toast.error(t("Please select a payment method"));
        return;
      }
      setStep("review");
    }
  };

  const goBack = () => {
    const idx = (["information", "shipping", "payment", "review"] as CheckoutStep[]).indexOf(step);
    if (idx > 0)
      setStep((["information", "shipping", "payment", "review"] as CheckoutStep[])[idx - 1]!);
  };

  const handleSubmit = async () => {
    if (lines.length === 0) {
      toast.error(t("Your order has no items"));
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiFetch<{
        paymentUrl: string | null;
        /** 游客查单令牌：仅创建成功时下发一次，跳支付页必须带上 */
        orderToken: string | null;
        /** 后端回传的订单序列化对象（状态判断 + 订单详情跳转用） */
        order?: {
          orderNumber: string;
          status?: string;
          isCashOnDelivery?: boolean | null;
        } | null;
      }>("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          items: orderItems(),
          // 结账页一律用内联地址（原站形态）；地址簿只用于「一键带入」表单
          shippingAddress: {
            country: addr.country,
            firstName: addr.firstName.trim(),
            lastName: addr.lastName.trim(),
            line1: addr.line1.trim(),
            line2: addr.line2.trim() || null,
            city: addr.city.trim(),
            state: addr.state.trim(),
            postalCode: addr.postalCode.trim(),
            phone: addr.phone.trim() || null,
          },
          contactEmail: contactEmail.trim() || null,
          shippingMethod,
          note: note.trim() || null,
          channelCode: selectedChannel ?? undefined,
          couponCode: applied?.code ?? null,
        }),
      });
      if (res?.paymentUrl) {
        // 游客单必须携带查单令牌：支付页与订单详情共用同一 token，
        // 缺失时 mock-pay / 订单详情会被 requireOrderAccess 拒绝（403，页面卡在 Processing）。
        const url = new URL(res.paymentUrl, window.location.origin);
        if (res.orderToken && !url.searchParams.has("token")) {
          url.searchParams.set("token", res.orderToken);
        }
        // 跳转前不重置 submitting：浏览器即将卸载本页，保持 disabled 防止重复下单
        window.location.href = url.toString();
      } else if (res?.order?.isCashOnDelivery) {
        // COD（货到付款）：无支付页——直接跳订单详情页看「到付金额」与后续进度
        const url = new URL(`/orders/${res.order.orderNumber}`, window.location.origin);
        if (res.orderToken) url.searchParams.set("token", res.orderToken);
        // 同上：跳转前保持 disabled，防重复下单
        window.location.href = url.toString();
      } else if (res?.order?.status === "PENDING_PAYMENT") {
        // 订单已创建但支付地址初始化失败时，后端仍返回 order + orderToken。
        // 不再把顾客留在 Review 看到一个没有下一步的「成功」toast，而是进入订单详情；
        // 详情页提供 Pay now 重试入口（游客凭 token，登录态凭账号权限），避免无提示死单。
        const orderNumber = res.order.orderNumber;
        const url = new URL(`/orders/${orderNumber}`, window.location.origin);
        if (res.orderToken) url.searchParams.set("token", res.orderToken);
        window.location.href = url.toString();
      } else {
        toast.success(t("Order submitted"));
        setSubmitting(false);
      }
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : t("Failed to submit your order, please try again later"),
      );
      setSubmitting(false);
    }
  };

  /* ---------------- 渲染 ---------------- */

  if (phase === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-[#707070]" />
      </div>
    );
  }

  if (phase === "empty" || lines.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <MapPin aria-hidden className="h-6 w-6 text-[#707070]" />
        <h1 className="text-[20px] font-semibold text-black">{t("Checkout unavailable")}</h1>
        <p className="max-w-md text-[14px] text-[#707070]">
          {t("Your cart is empty or items failed to load — please go back and continue shopping.")}
        </p>
        <a href="/products" className={CK.primaryBtn + " inline-flex items-center px-6"}>
          {t("Browse Products")}
        </a>
      </div>
    );
  }

  const primaryLabel =
    step === "information"
      ? t("Continue to shipping")
      : step === "shipping"
        ? t("Continue to payment")
        : step === "payment"
          ? t("Continue to review")
          : submitting
            ? t("Submitting…")
            : t("Complete order");

  const fieldErr = (k: string) =>
    fieldErrors[k] ? <p className="mt-1.5 text-[13px] text-destructive">{fieldErrors[k]}</p> : null;

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[9.65fr_40.10fr_3.70fr_46.55fr]">
      {/* ── 移动端顶部品牌标志（原站移动端在折叠条之上） ── */}
      <div className="px-3 py-4 lg:hidden">
        <CheckoutLogo href="/" src={logoUrl} alt="" invert={logoInvert} />
      </div>

      {/* ── 右栏：订单摘要。移动端排到表单之前（原站形态）── */}
      <aside
        className={cn(
          CK.sidebar,
          "order-first border-y border-[#EAEAEA] lg:order-none lg:col-start-4 lg:row-start-1 lg:min-h-screen lg:border-y-0",
        )}
      >
        {/* 移动端折叠条（原站：左「Order summary ⌄」右总额；桌面端隐藏） */}
        <button
          type="button"
          onClick={() => setSummaryOpen((v) => !v)}
          aria-expanded={summaryOpen}
          className="flex w-full items-center justify-between px-3 py-3 lg:hidden"
        >
          <span className="flex items-center gap-1 text-[14px] text-black">
            {t("Order summary")}
            <ChevronDown
              aria-hidden
              className={cn("h-4 w-4 transition-transform", summaryOpen && "rotate-180")}
            />
          </span>
          <span className="text-[14px] font-semibold text-black">
            {showUser(Math.max(0, shown.total))}
          </span>
        </button>

        <div className={cn(summaryOpen ? "block" : "hidden", "lg:block")}>
          {/* 侧栏内栅格：左内缩 38 / 内容 396 / 右余量 133（原站实测，占侧栏 566 的比例） */}
          <div className="grid grid-cols-1 lg:grid-cols-[6.71fr_69.96fr_23.33fr]">
            <div aria-hidden className="hidden lg:block" />
            <div className="px-3 pb-8 pt-2 lg:px-0 lg:pt-[39px]">
              {/* 明细 */}
              <ul className="space-y-4">
                {lines.map((line) => (
                  <li key={line.id} className="flex items-center gap-4">
                    <div className="relative shrink-0">
                      {/* 原站实测：白底圆角盒 64×64（圆角 ~16），商品图内缩 2px（~60×60，圆角 ~12）——
                          与 PDP 缩略图「52 装 56」同一设计语言。 */}
                      <div className="h-[64px] w-[64px] overflow-hidden rounded-[16px] border border-[#EAEAEA] bg-white p-[2px]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={line.image ?? "/images/brand/tee-1.svg"}
                          alt={line.name}
                          className="h-full w-full rounded-[12px] object-cover"
                        />
                      </div>
                      <QtyBadge qty={line.quantity} />
                    </div>
                    {/* 价格与标题首行同基线（原站实测：标题字形 56..66、价格字形 56..67），
                        故内层用 items-start；若把价格作为整行的第三个子项会被垂直居中，低 8px。 */}
                    <div className="flex min-w-0 flex-1 items-start gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] leading-tight text-black">{line.name}</p>
                        {formatSpecValues(line.attributes) ? (
                          <p className="mt-[3px] text-[13px] leading-none text-[#707070]">
                            {formatSpecValues(line.attributes)}
                          </p>
                        ) : null}
                        {line.isPresale ? (
                          <p className="mt-1 text-[12px] leading-none text-[#666666]">
                            {t("Pre-order")}
                          </p>
                        ) : null}
                      </div>
                      <span className="shrink-0 text-[15px] leading-tight text-black">
                        {format(line.subtotal)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>

              {/* 折扣码：与商品行间距 21（原站 盒底 103 → 折扣盒上边框 124） */}
              <div className="mt-[21px]">
                {applied ? (
                  <div className="flex min-h-[49px] items-center justify-between gap-3 rounded-[8px] border border-[#E5E5E5] bg-white px-[13px] py-[6px]">
                    <span className="flex min-w-0 items-center gap-2 text-[14px] text-black">
                      <span className="truncate font-mono">{applied.code}</span>
                      {applied.freeShipping ? (
                        <span className="shrink-0 text-[12px] text-[#707070]">
                          {t("Free shipping")}
                        </span>
                      ) : null}
                    </span>
                    <button
                      type="button"
                      onClick={removeCoupon}
                      className="shrink-0 text-[13px] text-[#707070] underline underline-offset-2 hover:text-black"
                    >
                      {t("Remove")}
                    </button>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center gap-[6px] rounded-[8px] border border-[#E5E5E5] bg-white p-[6px] pl-[12px]">
                      <input
                        value={couponInput}
                        onChange={(e) => {
                          setCouponInput(e.target.value);
                          setCouponError(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void applyCoupon(couponInput);
                          }
                        }}
                        placeholder={t("Discount code")}
                        aria-label={t("Discount code")}
                        aria-invalid={!!couponError}
                        className="h-[35px] min-w-0 flex-1 bg-transparent text-[14px] text-black placeholder:text-[#707070] focus:outline-none"
                      />
                      {/* 原站：输入为空时 Apply 是浅灰禁用态，填入后才变深色可点 */}
                      <button
                        type="button"
                        disabled={!couponInput.trim() || couponBusy}
                        onClick={() => void applyCoupon(couponInput)}
                        className={cn(
                          "h-[35px] shrink-0 rounded-[8px] px-[10px] text-[14px] leading-none transition-colors",
                          couponInput.trim()
                            ? "bg-black text-white hover:opacity-90"
                            : "border border-[#F0F0F0] bg-[#FAFAFA] text-[#808080]",
                        )}
                      >
                        {couponBusy ? "…" : t("Apply")}
                      </button>
                    </div>
                    {couponError ? (
                      <p className="mt-2 text-[13px] text-destructive">{couponError}</p>
                    ) : null}
                  </div>
                )}
              </div>

              {/* 金额：与折扣盒间距 21（原站 172 → 193）。
                  注意：这里刻意**不用** space-y——Tailwind 的 space-y 生成的选择器含两个 :not 伪类，
                  特异性高于单类的 mt-[Npx]，会把 Total 行的 mt-[21px] 压回 11px。故逐行写外边距。 */}
              <div className="mt-[21px]">
                {/* 汇总各行的金额一律用 shown（已按汇率分配、恒等式成立）；
                    此处**不能**再用 format(usd)，否则各分量独立舍入导致明细和差 1 分 */}
                <SummaryRow label={t("Subtotal")} value={showUser(shown.subtotal)} />
                <SummaryRow
                  className="mt-[11px]"
                  label={t("Shipping")}
                  value={
                    step === "information" ? (
                      <span className="text-[#707070]">{t("Calculated at next step")}</span>
                    ) : currentMethod?.isCashOnDelivery ? (
                      <span className="text-[#707070]">
                        {t("Pay on delivery")} {format(currentMethod.fee)}
                      </span>
                    ) : freeShippingByThreshold ? (
                      t("Free shipping")
                    ) : (
                      showUser(shown.shipping)
                    )
                  }
                />
                {discountUsd > 0 ? (
                  <SummaryRow
                    className="mt-[11px]"
                    label={t("Discount")}
                    value={`−${showUser(shown.discount)}`}
                    valueClassName="text-[#707070]"
                  />
                ) : null}
                {taxRate > 0 ? (
                  <SummaryRow
                    className="mt-[11px]"
                    label={t("Tax")}
                    value={showUser(shown.tax)}
                  />
                ) : null}
                {/* Total 与 Shipping 间距 21：原站 Shipping 字形顶 220 → Total 字形顶 256（差 36），
                    Shipping 行高 15，故 gap = 36 − 15 = 21。 */}
                <div className="mt-[21px] flex items-baseline justify-between gap-4">
                  <span className="text-[16px] font-bold leading-none text-black">
                    {t("Total")}
                  </span>
                  <span className="flex items-baseline gap-2">
                    <span className="text-[12px] uppercase leading-none text-[#707070]">
                      {currencyCode}
                    </span>
                    <span className="text-[16px] font-bold leading-none text-black">
                      {showUser(Math.max(0, shown.total))}
                    </span>
                  </span>
                </div>
              </div>

              {/* 凑单免邮提示（自建增强，原站无此文案；口径与服务端一致） */}
              {toFreeShipping > 0 && currentMethod && !currentMethod.isCashOnDelivery ? (
                <p className="mt-[21px] text-[13px] leading-snug text-[#707070]">
                  {t("Spend {amount} more to unlock free shipping (over {threshold})", {
                    amount: format(toFreeShipping),
                    threshold: format(freeOver),
                  })}
                </p>
              ) : null}
            </div>
            <div aria-hidden className="hidden lg:block" />
          </div>
        </div>
      </aside>

      {/* ── 左栏：表单 ── */}
      <div className="flex flex-col px-3 pb-16 lg:col-start-2 lg:row-start-1 lg:px-0 lg:pb-[42px] lg:pt-0">
        {/* Logo 下间距 18：原站 Logo 底 68 → 面包屑盒顶 86 */}
        <div className="mb-[18px] hidden lg:block lg:pt-[37px]">
          <CheckoutLogo href="/" src={logoUrl} alt="" invert={logoInvert} />
        </div>

        {/* 面包屑盒 86..99 → h2 盒顶 127，故 28 */}
        <div className="mb-7">
          <CheckoutBreadcrumb current={step} onNavigate={(s) => setStep(s)} t={t} />
        </div>

        {step === "information" ? (
          <div className="space-y-[35px]">
            {/* Contact */}
            <section className="space-y-[10px]">
              <div className="mb-[3px] flex items-baseline justify-between gap-4">
                <h2 className={CK.h2}>{t("Contact")}</h2>
                {signedIn ? null : (
                  <a
                    href={`/auth/login?next=${encodeURIComponent("/checkout")}`}
                    className="text-[14px] text-black underline underline-offset-2 hover:no-underline"
                  >
                    {t("Sign in")}
                  </a>
                )}
              </div>
              <div>
                <CheckoutInput
                  type="email"
                  autoComplete="email"
                  value={contactEmail}
                  onChange={(e) => {
                    setContactEmail(e.target.value);
                    setFieldErrors((p) => ({ ...p, contactEmail: "" }));
                  }}
                  placeholder={t("Email")}
                  aria-label={t("Email")}
                  icon={
                    <EmailHintIcon
                      title={t("We'll email your order confirmation and tracking updates here.")}
                    />
                  }
                />
                {fieldErr("contactEmail")}
              </div>
              {needsPhone ? (
                <div>
                  <CheckoutInput
                    type="tel"
                    autoComplete="tel"
                    value={addr.phone}
                    onChange={(e) => {
                      setAddr((p) => ({ ...p, phone: e.target.value }));
                      setFieldErrors((p) => ({ ...p, phone: "" }));
                    }}
                    placeholder={t("Phone number")}
                    aria-label={t("Phone number")}
                  />
                  {fieldErr("phone")}
                </div>
              ) : null}
            </section>

            {/* Shipping address */}
            <section className="space-y-[10px]">
              <h2 className={cn(CK.h2, "mb-[3px]")}>{t("Shipping address")}</h2>

              {/* 登录用户：已保存地址一键带入（保留既有的地址簿能力，原站对应「选择已存地址」） */}
              {signedIn && savedAddresses.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {savedAddresses.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => {
                        const [first, ...rest] = a.recipientName.split(" ");
                        setAddr({
                          country: a.country || DEFAULT_COUNTRY,
                          firstName: first ?? a.recipientName,
                          lastName: rest.join(" "),
                          line1: a.detail,
                          line2: a.line2 ?? "",
                          city: a.city,
                          state: a.province,
                          postalCode: a.postalCode ?? "",
                          phone: a.phone ?? "",
                        });
                        setFieldErrors({});
                      }}
                      className="rounded-[8px] border border-[#DEDEDE] bg-white px-3 py-2 text-left text-[13px] text-black hover:border-black"
                    >
                      <span className="block font-medium">{a.recipientName}</span>
                      <span className="block text-[12px] text-[#707070]">
                        {a.city} {a.detail}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}

              <CheckoutSelect
                label={t("Country/Region")}
                value={addr.country}
                onChange={(v) => {
                  setAddr((p) => ({ ...p, country: v, state: "" }));
                  setFieldErrors({});
                }}
                aria-label={t("Country/Region")}
              >
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {lang === "zh" ? c.nameZh : c.name}
                  </option>
                ))}
              </CheckoutSelect>

              <div className="grid grid-cols-1 gap-[10px] sm:grid-cols-2">
                <div>
                  <CheckoutInput
                    autoComplete="given-name"
                    value={addr.firstName}
                    onChange={(e) => {
                      setAddr((p) => ({ ...p, firstName: e.target.value }));
                      setFieldErrors((p) => ({ ...p, firstName: "" }));
                    }}
                    placeholder={t("First name")}
                    aria-label={t("First name")}
                  />
                  {fieldErr("firstName")}
                </div>
                <div>
                  <CheckoutInput
                    autoComplete="family-name"
                    value={addr.lastName}
                    onChange={(e) => {
                      setAddr((p) => ({ ...p, lastName: e.target.value }));
                      setFieldErrors((p) => ({ ...p, lastName: "" }));
                    }}
                    placeholder={t("Last name")}
                    aria-label={t("Last name")}
                  />
                  {fieldErr("lastName")}
                </div>
              </div>

              <div>
                <CheckoutInput
                  autoComplete="address-line1"
                  value={addr.line1}
                  onChange={(e) => {
                    setAddr((p) => ({ ...p, line1: e.target.value }));
                    setFieldErrors((p) => ({ ...p, line1: "" }));
                  }}
                  placeholder={t("Address")}
                  aria-label={t("Address")}
                  icon={<AddressLookupIcon />}
                />
                {fieldErr("line1")}
              </div>

              <CheckoutInput
                autoComplete="address-line2"
                value={addr.line2}
                onChange={(e) => setAddr((p) => ({ ...p, line2: e.target.value }))}
                placeholder={t("Apartment, suite, etc. (optional)")}
                aria-label={t("Apartment, suite, etc. (optional)")}
              />

              <div className="grid grid-cols-1 gap-[10px] sm:grid-cols-3">
                <div>
                  <CheckoutInput
                    autoComplete="address-level2"
                    value={addr.city}
                    onChange={(e) => {
                      setAddr((p) => ({ ...p, city: e.target.value }));
                      setFieldErrors((p) => ({ ...p, city: "" }));
                    }}
                    placeholder={t("City")}
                    aria-label={t("City")}
                  />
                  {fieldErr("city")}
                </div>
                <div>
                  {/* 美国/加拿大有州省清单 → 下拉；其余国家 → 文本框（原站行为） */}
                  {states.length > 0 ? (
                    <CheckoutSelect
                      label={t("State")}
                      value={addr.state}
                      onChange={(v) => {
                        setAddr((p) => ({ ...p, state: v }));
                        setFieldErrors((p) => ({ ...p, state: "" }));
                      }}
                      aria-label={t("State")}
                    >
                      <option value="">—</option>
                      {states.map((s) => (
                        <option key={s.code} value={lang === "zh" && s.nameZh ? s.nameZh : s.name}>
                          {lang === "zh" && s.nameZh ? s.nameZh : s.name}
                        </option>
                      ))}
                    </CheckoutSelect>
                  ) : (
                    <CheckoutInput
                      autoComplete="address-level1"
                      value={addr.state}
                      onChange={(e) => {
                        setAddr((p) => ({ ...p, state: e.target.value }));
                        setFieldErrors((p) => ({ ...p, state: "" }));
                      }}
                      placeholder={t("State")}
                      aria-label={t("State")}
                    />
                  )}
                  {fieldErr("state")}
                </div>
                <div>
                  <CheckoutInput
                    autoComplete="postal-code"
                    value={addr.postalCode}
                    onChange={(e) => {
                      setAddr((p) => ({ ...p, postalCode: e.target.value }));
                      setFieldErrors((p) => ({ ...p, postalCode: "" }));
                    }}
                    placeholder={t("ZIP code")}
                    aria-label={t("ZIP code")}
                  />
                  {fieldErr("postalCode")}
                </div>
              </div>

              <label className="mt-[9px] flex cursor-pointer items-center gap-2 text-[14px] text-black">
                <input
                  type="checkbox"
                  checked={saveInfo}
                  onChange={(e) => setSaveInfo(e.target.checked)}
                  className="h-[18px] w-[18px] shrink-0 rounded-[4px] border border-[#DEDEDE] accent-black"
                />
                {t("Save this information for next time")}
              </label>
            </section>
          </div>
        ) : null}

        {step === "shipping" ? (
          <section className="space-y-[10px]">
            <h2 className={CK.h2}>{t("Shipping method")}</h2>
            {shippingMethods.length === 0 ? (
              <p className={CK.muted}>
                {t("No shipping methods available, please contact customer service.")}
              </p>
            ) : (
              <div className="space-y-[10px]">
                {shippingMethods.map((m) => {
                  const methodFree = m.freeOver > 0 && subtotal >= m.freeOver;
                  const label = lang === "zh" ? m.name : (m.nameEn ?? m.name);
                  const desc =
                    lang === "zh" ? (m.description ?? m.etaZh) : (m.descriptionEn ?? m.etaEn);
                  const selected = shippingMethod === m.code;
                  return (
                    <label
                      key={m.id}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-[8px] border bg-white p-[13px]",
                        selected ? "border-black" : "border-[#DEDEDE]",
                      )}
                    >
                      <input
                        type="radio"
                        name="shipping-method"
                        value={m.code}
                        checked={selected}
                        onChange={() => setShippingMethod(m.code)}
                        className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-black"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14px] text-black">{label}</span>
                        {desc ? (
                          <span className="mt-1 block text-[13px] text-[#707070]">{desc}</span>
                        ) : null}
                        {m.isCashOnDelivery ? (
                          <span className="mt-1 block text-[13px] text-[#707070]">
                            {t("Cash on Delivery")}
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 text-[14px] text-black">
                        {m.isCashOnDelivery ? (
                          <span className="text-[#707070]">{t("Pay on delivery")}</span>
                        ) : methodFree || m.fee === 0 ? (
                          t("Free shipping")
                        ) : (
                          format(m.fee)
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}

            <div className="pt-2">
              <label className="mb-2 block text-[14px] text-black" htmlFor="checkout-note">
                {t("Order notes (optional)")}
              </label>
              <textarea
                id="checkout-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                maxLength={300}
                placeholder={t("Add a note")}
                className="w-full rounded-[8px] border border-[#DEDEDE] bg-white p-[13px] text-[14px] text-black placeholder:text-[#707070] focus:border-black focus:outline-none"
              />
            </div>
          </section>
        ) : null}

        {step === "payment" ? (
          <section className="space-y-[10px]">
            <h2 className={CK.h2}>{t("Payment method")}</h2>
            {payChannels.length === 0 ? (
              <p className={CK.muted}>{t("Not available yet")}</p>
            ) : (
              <div className="space-y-[10px]">
                {payChannels.map((c) => {
                  const selected = selectedChannel === c.code;
                  return (
                    <label
                      key={c.code}
                      className={cn(
                        "flex items-start gap-3 rounded-[8px] border bg-white p-[13px]",
                        c.available ? "cursor-pointer" : "cursor-not-allowed opacity-60",
                        selected && c.available ? "border-black" : "border-[#DEDEDE]",
                      )}
                    >
                      <input
                        type="radio"
                        name="pay-channel"
                        value={c.code}
                        checked={selected}
                        disabled={!c.available}
                        onChange={() => setSelectedChannel(c.code)}
                        className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-black"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 text-[14px] text-black">
                          <CreditCard aria-hidden className="h-4 w-4" />
                          {c.name}
                        </span>
                        {!c.available ? (
                          <span className="mt-1 block text-[13px] text-[#707070]">
                            {c.currencyMismatch
                              ? t(
                                  "Not available for this currency — switch currency or pick another method",
                                )
                              : t("Not available yet")}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </section>
        ) : null}

        {step === "review" ? (
          <section className="space-y-[10px]">
            <h2 className={CK.h2}>{t("Review")}</h2>
            <dl className="space-y-4 text-[14px]">
              <div className="flex justify-between gap-6">
                <dt className="text-[#707070]">{t("Contact")}</dt>
                <dd className="text-right text-black">{signedIn ? defaultEmail : contactEmail}</dd>
              </div>
              <div className="flex justify-between gap-6">
                <dt className="text-[#707070]">{t("Shipping address")}</dt>
                <dd className="text-right text-black">
                  {`${addr.firstName} ${addr.lastName}`.trim()}
                  <br />
                  {addr.line1}
                  {addr.line2 ? (
                    <>
                      <br />
                      {addr.line2}
                    </>
                  ) : null}
                  <br />
                  {`${addr.city}, ${addr.state} ${addr.postalCode}`.trim()}
                  <br />
                  {lang === "zh" ? country.nameZh : country.name}
                  {addr.phone ? (
                    <>
                      <br />
                      {addr.phone}
                    </>
                  ) : null}
                </dd>
              </div>
              <div className="flex justify-between gap-6">
                <dt className="text-[#707070]">{t("Shipping method")}</dt>
                <dd className="flex items-center gap-2 text-right text-black">
                  <Truck aria-hidden className="h-4 w-4" />
                  {currentMethod
                    ? lang === "zh"
                      ? currentMethod.name
                      : (currentMethod.nameEn ?? currentMethod.name)
                    : "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-6">
                <dt className="text-[#707070]">{t("Payment method")}</dt>
                <dd className="text-right text-black">
                  {payChannels.find((c) => c.code === selectedChannel)?.name ?? "—"}
                </dd>
              </div>
              {note.trim() ? (
                <div className="flex justify-between gap-6">
                  <dt className="text-[#707070]">{t("Order notes")}</dt>
                  <dd className="whitespace-pre-wrap text-right text-black">{note}</dd>
                </div>
              ) : null}
            </dl>
          </section>
        ) : null}

        {/* 动作行：左「Return to cart」/「返回上一步」，右主按钮（原站形态） */}
        <div className="mt-[22px] flex items-center justify-between gap-4">
          {step === "information" ? (
            <a href="/cart" className={CK.ghostBtn}>
              <ChevronLeft aria-hidden className="h-4 w-4" />
              {t("Return to cart")}
            </a>
          ) : (
            <button type="button" onClick={goBack} className={CK.ghostBtn}>
              <ChevronLeft aria-hidden className="h-4 w-4" />
              {t("Back")}
            </button>
          )}
          <button
            type="button"
            className={CK.primaryBtn}
            disabled={submitting}
            onClick={() => (step === "review" ? void handleSubmit() : void goNext())}
          >
            {primaryLabel}
          </button>
        </div>

        {/* 已应用的折扣码在移动端折叠时不显示，这里给一行提示，避免用户以为没生效 */}
        {applied && !summaryOpen ? (
          <p className="mt-4 flex items-center gap-2 text-[13px] text-[#707070] lg:hidden">
            <X aria-hidden className="h-3 w-3" />
            {t("Discount code")} {applied.code} · −{format(applied.discountUsd)}
          </p>
        ) : null}

        {/* 法务链接：原站 y 833..846（视口底 −42）、x 117..297、色 #6d6d6d、间隔 17px。
            与店铺页脚不同——原站店铺页脚 6 条且无 Refund Policy；结账页脚实测为
            `Refund policy · Privacy policy · Cookies` 三条。 */}
        <div className="mt-auto hidden items-center gap-[17px] pt-10 lg:flex">
          <a href="/policies/refund" className={CK.legalLink}>
            {t("Refund policy")}
          </a>
          <a href="/policies/privacy" className={CK.legalLink}>
            {t("Privacy policy")}
          </a>
          <a href="/policies/cookies" className={CK.legalLink}>
            {t("Cookies")}
          </a>
        </div>
      </div>

      {/* ── 栏间距占位（仅桌面端） ── */}
      <div aria-hidden className="hidden lg:col-start-3 lg:row-start-1 lg:block" />
    </div>
  );
}
