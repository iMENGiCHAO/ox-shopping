"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { QuantityInput } from "@/components/shop/quantity-input";
import { AddToCartButton } from "@/components/shop/add-to-cart-button";
import { VariantSelect } from "@/components/shop/variant-select";
import { BuyNowButton } from "@/components/shop/buy-now-button";
import type { SpecSelection } from "@/components/shop/types";
import { cn } from "@/lib/utils";
import { isScarceInStock, MAX_PRESALE_QTY } from "@/lib/inventory";
import { useT } from "@/components/shop/lang-provider";

export interface SpecGroup {
  name: string;
  values: string[];
  /** 官方变体级售罄值（禁用 + 划线，默认选中首个有货值） */
  soldOutValues?: string[];
}

export interface BuyPanelProps {
  /** 组合粒度变体（可选）：{ attributes, stock, image }[]，attributes 为该组合的属性快照；
   *  image 为该组合的图（可空 = 用商品主图）——选中组合后大图跟随切换 */
  variants?: {
    attributes: { name: string; value: string }[];
    stock: number;
    image?: string | null;
  }[];
  productId: string;
  stock: number;
  /** 预售：0 库存仍可下单 */
  isPresale?: boolean;
  /**
   * 预售提示文案（多语言）。
   * 优先级：商品级覆盖 → 站级默认（SiteSetting）→ 内置兜底文案。
   * 在服务端按当前 lang 注入对应的语种；缺该语种时回退到另一种，再回退到内置。
   */
  presaleNote?: string | null;
  /** Selectable spec groups (color/size/config etc) — the customer must pick */
  selectableAttributes?: SpecGroup[];
  /** 服务端渲染的描述块 — 官方顺序：规格之后、数量行之前 */
  descriptionSlot?: ReactNode;
  /** 已登录账号邮箱（Notify me 预填） */
  defaultEmail?: string;
  /** 商品名（Notify me 弹窗内展示，官方行为） */
  productName?: string;
  className?: string;
}

/* Color value → hex for round swatches (x.com style) */
const COLOR_HEX: Record<string, string> = {
  Black: "#1C1C1C",
  "Obsidian Black": "#1A1A1A",
  "Patterned Black": "#2B2B2B",
  Charcoal: "#2D2D2D",
  "Space Gray": "#3F3F3F",
  "Dark Grey": "#3F3F3F",
  Silver: "#D4D4D4",
  "Stellar Silver": "#D4D4D4",
  White: "#FAFAFA",
  "Glacier Blue": "#A8C5D9",
  Blue: "#4A6B8A",
  Navy: "#1F2D3D",
  "Pearl White": "#F5F1EA",
  Khaki: "#C3B091",
  Red: "#B8434A",
  Green: "#5A7255",
  Olive: "#6B6730",
  Yellow: "#D4A436",
  Gold: "#B8973D",
  Purple: "#6B4D7A",
  Pink: "#D4A0B5",
  Brown: "#6B4A2D",
  /* zh */
  黑色: "#1C1C1C",
  白色: "#FAFAFA",
  银色: "#D4D4D4",
  灰色: "#808080",
  蓝色: "#4A6B8A",
  红色: "#B8434A",
  绿色: "#5A7255",
  黄色: "#D4A436",
  金色: "#B8973D",
  粉色: "#D4A0B5",
  紫色: "#6B4D7A",
  棕色: "#6B4A2D",
  深空灰: "#3F3F3F",
  冰川蓝: "#A8C5D9",
  曜石黑: "#1A1A1A",
};

function isColorGroup(name: string, values: string[]): boolean {
  if (/colou?r|颜色/i.test(name)) return true;
  return values.every((v) => COLOR_HEX[v] !== undefined);
}

/**
 * Buy panel — 上游参考站 replica:
 * color groups render as 56px round swatches (black ring when active);
 * other groups render as a square full-width select; quantity stepper;
 * stacked black 46px CTAs.
 */
export function BuyPanel({
  productId,
  stock,
  isPresale = false,
  presaleNote,
  selectableAttributes = [],
  /**
   * SKU 矩阵（组合粒度）：有值时前台按**真实存在的组合**联动过滤 ——
   * 选定颜色后，只渲染与该颜色共同存在的规格值（红色没有 L → 不出现 L），
   * 彻底消除「能选不能买」；售罄与数量上限也以当前组合的库存为准。
   */
  variants,
  descriptionSlot,
  className,
  defaultEmail,
  productName,
}: BuyPanelProps) {
  const [quantity, setQuantity] = useState(1);
  const t = useT();
  const [selections, setSelections] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const g of selectableAttributes) {
      // 默认选中首个有货值（官方行为）
      const firstAvailable =
        g.values.find((v) => !(g.soldOutValues ?? []).includes(v)) ?? g.values[0] ?? "";
      init[g.name] = firstAvailable;
    }
    // 跨组联动校正（P0-1 商用审计）：逐组独立取「首个非售罄值」不感知组合，
    // 部分矩阵（Black/S 有货、White/M 有货，两组 soldOutValues 都为空）会默认
    // 落在不存在的组合上 → selectedVariant=null → 首屏按钮变「到货提醒」——
    // 有货商品呈现为买不了，转化直接受损。贪心重选（≤3 轮收敛，组合最多
    // 4 个维度）：每组取与「其他组当前已选」构成真实组合且库存>0 的第一个值；
    // 全部组合都无货时保持原默认（确实只能到货提醒）。
    if (variants && variants.length > 0) {
      const inStockComboWith = (sel: Record<string, string>) =>
        variants.find(
          (v) =>
            v.stock > 0 &&
            Object.entries(sel).every(
              ([n, vv]) => !vv || v.attributes.some((a) => a.name === n && a.value === vv),
            ),
        );
      for (let pass = 0; pass < 3; pass++) {
        let changed = false;
        for (const g of selectableAttributes) {
          const others = Object.fromEntries(
            Object.entries(init).filter(([n]) => n !== g.name),
          );
          const good = g.values.find((v) => inStockComboWith({ ...others, [g.name]: v }));
          if (good && init[g.name] !== good) {
            init[g.name] = good;
            changed = true;
          }
        }
        if (!changed) break;
      }
    }
    return init;
  });

  /* SKU 矩阵联动：某组的某值是否与「其他组已选值」构成真实存在的组合 */
  const variantMode = (variants?.length ?? 0) > 0;
  const valueExistsWithSelection = (groupName: string, value: string): boolean => {
    if (!variantMode) return true;
    const others = Object.entries(selections).filter(([n]) => n !== groupName);
    return variants!.some(
      (v) =>
        v.attributes.some((a) => a.name === groupName && a.value === value) &&
        others.every(([n, vv]) => v.attributes.some((a) => a.name === n && a.value === vv)),
    );
  };
  /**
   * 值级售罄判定（大爷 2026-09-28：「选中的没有库存也没有显示售罄，前后端没打通」）：
   * 变体模式下必须**结合当前已选的其他维度**实时判定 —— 例如已选「黑」时，
   * 黑/M 这个组合无库存 → M 立即画斜线；而不是只看该值在所有组合里是否都售罄
   * （静态判定会让「黑/M 售罄但白/M 有货」的 M 不划线，顾客点了才知道买不了）。
   */
  const isValueSoldOut = (groupName: string, value: string, staticSoldOut: string[]): boolean => {
    if (!variantMode) return staticSoldOut.includes(value) || disabled;
    // **父维度（第一个属性组，即大爷说的「第一个添加的属性」）用静态口径**：
    // 只要该值还有**任一组合**有货就不划线 —— 否则「白/M 有货但白/S 售罄」会把
    // 整个「白」划掉，顾客以为这个颜色不能买（Playwright 实拍发现的误判）。
    const groupIndex = selectableAttributes.findIndex((x) => x.name === groupName);
    if (groupIndex <= 0) return staticSoldOut.includes(value) || disabled;
    // 子维度：按当前已选的父维度动态判定（选了黑 → 黑/M 无货则 M 划线）
    const others = Object.entries(selections).filter(([n]) => n !== groupName);
    const matched = variants!.find(
      (v) =>
        v.attributes.some((a) => a.name === groupName && a.value === value) &&
        others.every(([n, vv]) => v.attributes.some((a) => a.name === n && a.value === vv)),
    );
    // 组合不存在 或 该组合无库存 → 售罄
    return !matched || matched.stock <= 0;
  };

  /** 当前所选组合对应的变体（变体模式下用于库存/售罄判定） */
  const selectedVariant = (() => {
    if (!variantMode) return null;
    const entries = Object.entries(selections).filter(([, v]) => v);
    if (entries.length === 0) return null;
    return (
      variants!.find((v) =>
        entries.every(([n, vv]) => v.attributes.some((a) => a.name === n && a.value === vv)),
      ) ?? null
    );
  })();

  /* 图随规格联动（大爷 2026-10-01 需求）：选中组合后大图切到该组合的图。
     BuyPanel 管选中状态、Gallery 管图集（左右两栏分离）——用 window 自定义
     事件解耦（与 cart:open 同款模式）；Gallery 监听后把组合图前置到大图首位。 */
  const selectedImage = selectedVariant?.image ?? null;
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("variant:image", {
        detail: { image: selectedImage, productId },
      }),
    );
  }, [selectedImage, productId]);

  // 变体模式：数量上限用**当前组合**的库存（商品级只是汇总）
  const effectiveStock = selectedVariant ? selectedVariant.stock : stock;

  const max = isPresale
    ? MAX_PRESALE_QTY
    : Math.min(99, Math.max(1, effectiveStock));
  /* 整件售罄（非预售）：数量输入禁用、整页按钮切到货提醒 */
  const disabled = stock <= 0 && !isPresale;

  const selectedAttributes = useMemo<SpecSelection[]>(
    () =>
      selectableAttributes
        .map((g) => ({ name: g.name, value: selections[g.name] ?? g.values[0] ?? "" }))
        .filter((s) => s.value),
    [selectableAttributes, selections],
  );

  /* 当前所选规格组合是否含售罄值（整件售罄，或任意选中项落在 soldOutValues 里）。
     决定按钮形态：选中组合有货 → 「加入购物车」，选中售罄 → 「到货提醒」；
     这是大爷指出的核心诉求——售罄规格仍可选，选后切到货提醒，而不是点不动。 */
  const selectedSoldOut =
    // 变体模式：所选组合不存在或该组合库存为 0 → 走「到货提醒」
    (variantMode && (!selectedVariant || selectedVariant.stock <= 0)) ||
    disabled ||
    selectableAttributes.some((g) => (g.soldOutValues ?? []).includes(selections[g.name] ?? ""));

  return (
    <div className={className}>
      {/* 官方顺序：描述位于分隔线之后、规格选择器之前 */}
      {descriptionSlot}

      {selectableAttributes.length > 0 ? (
        <div className={descriptionSlot ? "mt-4 space-y-5" : "space-y-5"}>
          {selectableAttributes.map((g) => {
            const colorMode = isColorGroup(g.name, g.values);
            const soldOut = g.soldOutValues ?? [];
            return (
              <div key={g.name} className="space-y-2.5">
                {/* 组名带冒号，**冒号后回显当前选中值**（如 `Size: M`）。
                    ⚠️ 这段「回显选中值」是**大爷明确要求**的，原站**没有**：
                    2026-09-20 用 thum.io 抓原站 PDP 375 整页图放大核对，
                    原站标签文本只有 `Size:`（冒号后无值），选中值只在下面的下拉框里显示。
                    （旧注释称「原站实测标签为 `Size: XS`」，那半句是错的；
                    一条注释里的多个论断要分别取证 —— 见 memory。） */}
                <p className="flex items-center gap-3 text-[13px] text-foreground">
                  <span>{`${g.name}: ${selections[g.name] ?? g.values[0] ?? ""}`}</span>
                </p>
                {colorMode ? (
                  /* Round swatches — 官方 34px,active 黑环;售罄加正斜杠。
                     当前选中值即使与已选其他维度无真实组合也保留渲染（P2-5 商用审计）：
                     此前选 Black 后把 Size 切到 M（Black/M 不存在）→ Black 色块
                     被过滤消失，但标签仍显示 "Color: Black" 且无法点回 ——
                     保留渲染 + 售罄划线，用户可直接点回或改选。 */
                  <div className="flex flex-wrap gap-2.5">
                    {g.values
                      .filter(
                        (v) =>
                          valueExistsWithSelection(g.name, v) || selections[g.name] === v,
                      )
                      .map((v) => {
                      const active = selections[g.name] === v;
                      /* 售罄但**仍可点**：选中后整页按钮切到货提醒（大爷反馈的核心交互）。
                         售罄仅用反斜杠 + title 提示，不 disabled，保证可选中登记到货通知。 */
                      const out = isValueSoldOut(g.name, v, soldOut);
                      return (
                        <button
                          key={v}
                          type="button"
                          title={out ? `${v} — ${t("Sold out")}` : v}
                          aria-label={`${g.name}: ${v}`}
                          aria-pressed={active}
                          /* 防抖修复（大爷 2026-10-04 反馈：点色卡大图/整页跳一下）：
                             Chrome 对 sticky 双栏布局内的按钮点击聚焦会按其文档流位置
                             把页面滚动数百像素（实测 483→0），视觉上即「像重新加载」。
                             拦截原生聚焦发生在 pointerdown（click 里补救为时已晚）：
                             ① pointerdown preventDefault 阻止原生滚动聚焦；
                             ② click 时 preventScroll 聚焦补回焦点（键盘 Tab 聚焦
                                与 focus-visible 环不受影响，可访问性保持）。 */
                          onPointerDown={(e) => e.preventDefault()}
                          onClick={(e) => {
                            e.currentTarget.focus({ preventScroll: true });
                            setSelections((s) => ({ ...s, [g.name]: v }));
                          }}
                          className={cn(
                            "relative h-[34px] w-[34px] rounded-full border p-0 transition-colors",
                            active ? "border-foreground" : "border-transparent hover:border-border",
                          )}
                        >
                          {/* 可见色圆比触摸区小（原站观感更精细）：34px 按钮内 24px 色圆，
                              1px 极淡描边；此前用满尺寸 34px 实心圆 + 描边，视觉上偏大偏粗糙 */}
                          <span
                            className="absolute left-1/2 top-1/2 block h-6 w-6 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full ring-1 ring-black/10"
                            style={{ backgroundColor: COLOR_HEX[v] ?? "#D4D4D4" }}
                          />
                          {/* 官方售罄样式：反斜杠细线，两端略超出圆外更易识别 */}
                          {out ? (
                            <span
                              aria-hidden="true"
                              className="pointer-events-none absolute left-1/2 top-1/2 h-[1.5px] w-[42px] -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-full bg-[#1c1c1c]"
                            />
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  /* 下拉型规格：原生 radio + 内联展开（VariantSelect）——
                     对齐原站真实实现（fieldset + 原生 radio）。此前的 Radix 浮层
                     每次打开有 90~126ms 主线程长任务（大爷 2026-10-05「顿一下」），
                     换成常驻 DOM 的原生 radio 面板后开销归零，外观逐类保持一致。
                     注意：选项**不按已选父维度过滤**（售罄仅用文案标注，仍可选）。 */
                  <VariantSelect
                    groupName={g.name}
                    value={selections[g.name] ?? ""}
                    options={g.values}
                    isSoldOut={(v) => isValueSoldOut(g.name, v, soldOut)}
                    onChange={(v) => setSelections((s) => ({ ...s, [g.name]: v }))}
                    soldOutLabel={t("Sold out")}
                  />
                )}
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="mt-8 flex items-center gap-3">
        <QuantityInput
          value={quantity}
          min={1}
          max={max}
          onChange={setQuantity}
          disabled={selectedSoldOut && !isPresale}
        />
        {/* 大爷需求：库存即时友好提示——低库存加购前即提示，不等结账。
            阈值单一事实来源 lib/inventory（顾客口径：有货才谈「仅剩 N 件」）。
            变体模式用**当前组合**的库存（P2-3 商用审计）：组合剩 2/总量 8 时
            用总量会漏提示；总量 3/组合 20 会错误提示——「页面上看到的就是
            当前所选规格的真实可售量」。 */}
        {!isPresale && isScarceInStock(effectiveStock) ? (
          <p className="text-[13px] text-foreground/65">
            {t("Only {n} left", { n: effectiveStock })}
          </p>
        ) : null}
      </div>
      {isPresale ? (
        <p className="mt-4 border border-border bg-secondary px-3 py-2 text-[13px] text-foreground/80">
          {presaleNote ?? t("Pre-order item — ships within 14 days of payment")}
        </p>
      ) : null}
      <div className="mt-8 flex flex-col gap-3">
        {/* 按钮形态：当前所选组合有货 → 「加入购物车」；选中售罄（整件或单规格）→ 「到货提醒」 */}
        {selectedSoldOut && !isPresale ? null : (
          <AddToCartButton
            productId={productId}
            quantity={quantity}
            attributes={selectedAttributes}
            disabled={false}
            /* 传当前组合的真实可售量（P1-4 商用审计）：游客加购即时校验用
               opts.stock —— 传商品总量会让售罄组合加购时不提示 */
            stock={effectiveStock}
            isPresale={isPresale}
            className="h-[46px] w-full text-[15px]"
          />
        )}
        {selectedSoldOut && !isPresale ? (
          <BuyNowButton
            productId={productId}
            quantity={quantity}
            attributes={selectedAttributes}
            disabled={false}
            soldOut
            defaultEmail={defaultEmail}
            productName={productName}
            specGroups={selectableAttributes.map((g) => ({
              name: g.name,
              values: g.values,
              soldOutValues: g.soldOutValues ?? [],
            }))}
            className="h-[46px] w-full text-[15px]"
          />
        ) : null}
      </div>
    </div>
  );
}
