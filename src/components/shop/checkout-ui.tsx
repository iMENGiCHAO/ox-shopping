"use client";

import * as React from "react";
import { ChevronDown, ChevronRight, HelpCircle, Search } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 结账页 UI 基元。
 *
 * ⚠️ 这里的尺寸/颜色**不是设计稿，是原站 上游参考站 结账页的像素实测值**。
 * 实测方式：thum.io 以 `width/1200` 渲染原站购物车永久链接（302 进 Shopify 结账页），
 * 再用 ffmpeg 解 raw RGB 扫描边界。要点：
 *   - thum.io 以「请求宽 + 16px」渲染后裁掉右侧 16px → 图像 x 坐标 = 布局 x 坐标；
 *   - 布局宽 1216 时实测：左栏表单 x 117.3..617.0（宽 499.7），右栏 x 658.7..1216（宽 557.3）。
 *
 * 实测值清单（布局宽 1216）：
 *   输入框        高 50，圆角 8，描边 1px rgb(222,222,222)，白底，文字 14px，占位 rgb(112,112,112)
 *   主按钮        高 61，宽 182（「Continue to shipping」），纯黑 rgb(0,0,0)，白字
 *   标题 h2       字形高 14（≈20px 字号），纯黑
 *   面包屑        字形高 12（≈13px 字号）
 *   侧栏底色      rgb(245,245,245)，左描边 1px rgb(234,234,234)
 *   折扣码盒      398×50，圆角 8，描边 1px rgb(222,222,222)
 *   Apply 按钮    59×38，右侧内缩 6，底 rgb(250,250,250)，字 rgb(127,127,127)（空输入时的禁用态）
 *
 * 注意：本店全局 `--radius: 0rem`（直角），但原站结账页是 8px 圆角——
 * 这是结账页与店铺页的真实差异，故此处一律显式写 `rounded-[8px]`，不继承全局令牌。
 */
export const CK = {
  /** 文本输入框 */
  input:
    "h-[50px] w-full rounded-[8px] border border-[#DEDEDE] bg-white px-[13px] text-[14px] text-black placeholder:text-[#707070] focus:border-black focus:outline-none disabled:opacity-60",
  /** 带浮动标签的下拉框（原站 Country/Region、State 的形态：标签常驻框内左上） */
  selectBox:
    "h-[50px] w-full appearance-none rounded-[8px] border border-[#DEDEDE] bg-white pl-[13px] pr-[34px] pt-[19px] text-[14px] text-black focus:border-black focus:outline-none",
  /** 下拉框内左上角的小标签 */
  selectLabel:
    "pointer-events-none absolute left-[13px] top-[8px] text-[12px] leading-none text-[#707070]",
  /** 区块标题（Contact / Shipping address） */
  h2: "text-[20px] font-semibold leading-none text-black",
  /** 正文/金额标签 */
  body: "text-[14px] leading-none text-black",
  /** 次级文字（说明、占位、当前步骤之外的面包屑） */
  muted: "text-[14px] leading-none text-[#707070]",
  /** 主按钮：纯黑、61 高、8 圆角 */
  primaryBtn:
    "h-[61px] shrink-0 rounded-[8px] bg-black px-[21px] text-[14px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60",
  /** 次按钮（「Return to cart」这类无边框动作） */
  ghostBtn:
    "inline-flex items-center gap-2 text-[14px] text-black underline-offset-4 hover:underline",
  /** 侧栏面板：底色 + 左描边（宽度由外层栅格决定，这里只负责外观） */
  sidebar: "bg-[#F5F5F5] lg:border-l lg:border-[#EAEAEA]",
  /** 结账页正文链接（页脚法务链接） */
  legalLink: "text-[13px] leading-none text-[#6D6D6D] underline underline-offset-2 hover:text-black",
} as const;

/** 结账步骤（原站面包屑：Cart › Information › Shipping › Payment › Review） */
export const CHECKOUT_STEPS = ["information", "shipping", "payment", "review"] as const;
export type CheckoutStep = (typeof CHECKOUT_STEPS)[number];

/** 步骤 → 面包屑文案键（键即英文源串，中文由词典覆盖） */
const STEP_LABEL: Record<CheckoutStep, string> = {
  information: "Information",
  shipping: "Shipping",
  payment: "Payment",
  review: "Review",
};

/**
 * 面包屑。原站形态：`Cart › Information › Shipping › Payment › Review`，
 * **已过步骤与当前步骤为黑色，未到的步骤为灰色**；分隔符是细尖角。
 * 已过步骤可点回退（原站行为），未到的步骤不可点（不能跳过配送直接去支付）。
 */
export function CheckoutBreadcrumb({
  current,
  onNavigate,
  t,
}: {
  current: CheckoutStep;
  /** 点击已过步骤时回退；不传则全部只读 */
  onNavigate?: (step: CheckoutStep) => void;
  t: (key: string) => string;
}) {
  const currentIdx = CHECKOUT_STEPS.indexOf(current);
  return (
    <nav aria-label={t("Checkout")} className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
      <a href="/cart" className="text-[13px] leading-none text-[#707070] hover:text-black">
        {t("Cart")}
      </a>
      {CHECKOUT_STEPS.map((step, idx) => {
        const done = idx < currentIdx;
        const active = idx === currentIdx;
        const reachable = done && !!onNavigate;
        return (
          <React.Fragment key={step}>
            <ChevronRight aria-hidden className="h-3 w-3 text-[#B0B0B0]" />
            {reachable ? (
              <button
                type="button"
                onClick={() => onNavigate?.(step)}
                className="text-[13px] leading-none text-black hover:underline"
              >
                {t(STEP_LABEL[step])}
              </button>
            ) : (
              <span
                aria-current={active ? "step" : undefined}
                className={cn(
                  "text-[13px] leading-none",
                  active ? "font-semibold text-black" : "text-[#707070]",
                )}
              >
                {t(STEP_LABEL[step])}
              </span>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}

/** 文本输入框（可带右侧图标，如邮箱的「?」、地址的放大镜） */
export function CheckoutInput({
  icon,
  className,
  ...props
}: React.ComponentProps<"input"> & { icon?: React.ReactNode }) {
  if (!icon) return <input className={cn(CK.input, className)} {...props} />;
  return (
    <div className="relative">
      <input className={cn(CK.input, "pr-[36px]", className)} {...props} />
      <span className="pointer-events-none absolute right-[13px] top-1/2 -translate-y-1/2 text-[#707070]">
        {icon}
      </span>
    </div>
  );
}

/** 邮箱字段右侧的「?」说明图标（原站形态） */
export function EmailHintIcon({ title }: { title: string }) {
  return (
    <span title={title}>
      <HelpCircle aria-hidden className="h-4 w-4" />
    </span>
  );
}

/** 地址字段右侧的放大镜图标（原站形态） */
export function AddressLookupIcon() {
  return <Search aria-hidden className="h-4 w-4" />;
}

/**
 * 浮动标签下拉框。
 * 原站形态：标签（12px 灰）常驻框内左上，选中值（14px 黑）在其下方；
 * 与「只有 placeholder 的文本框」形成对比——这是 Shopify 结账页的既有设计。
 */
export function CheckoutSelect({
  label,
  value,
  onChange,
  children,
  className,
  ...props
}: Omit<React.ComponentProps<"select">, "onChange" | "value"> & {
  label: string;
  value: string;
  /** 直接给出选中的值（不是 DOM ChangeEvent），调用点无需再解包 e.target.value */
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <span className={CK.selectLabel}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(CK.selectBox, className)}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-[13px] top-1/2 h-4 w-4 -translate-y-1/2 text-[#707070]"
      />
    </div>
  );
}

/** 侧栏金额行（标签左、值右；值可为灰字提示） */
export function SummaryRow({
  label,
  value,
  valueClassName,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  valueClassName?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4", className)}>
      <span className="text-[15px] leading-none text-black">{label}</span>
      <span className={cn("text-[15px] leading-none text-black", valueClassName)}>{value}</span>
    </div>
  );
}

/**
 * 购物袋行数量角标：原站是**黑底白字圆形**，压在缩略图右上角并向外溢出。
 * 直径 22px，位置：top -6 / right -6（相对 60×60 缩略图）。
 */
export function QtyBadge({ qty }: { qty: number }) {
  return (
    <span
      aria-hidden
      className="absolute -right-[3px] -top-[3px] z-10 flex h-[20px] min-w-[20px] items-center justify-center rounded-full bg-black px-1 text-[12px] font-semibold leading-none text-white"
    >
      {qty}
    </span>
  );
}

/** 结账页左栏顶部的品牌标志（点击回店铺首页） */
export function CheckoutLogo({
  href,
  src,
  alt,
  invert,
  className,
}: {
  href: string;
  src: string;
  alt: string;
  /** 原站结账页是白底，而店铺默认 Logo 是白色图案（为黑色页头准备），故需要反相 */
  invert: boolean;
  className?: string;
}) {
  // 用 block + w-fit 而非 inline-block：inline-block 会坐在基线上，行盒按 strut 的
  // descender 多留 ~6px 空隙，把整条左栏纵向链整体下推（原站 crumb 盒顶 86，会变成 92）。
  return (
    <a href={href} aria-label={alt} className={cn("block w-fit", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className={cn("h-[31px] w-auto max-w-[140px] object-contain object-left", invert && "invert")}
      />
    </a>
  );
}
