"use client";

import { useMemo, useState, type ReactNode } from "react";
import { QuantityInput } from "@/components/shop/quantity-input";
import { AddToCartButton } from "@/components/shop/add-to-cart-button";
import { BuyNowButton } from "@/components/shop/buy-now-button";
import type { SpecSelection } from "@/components/shop/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { isScarceInStock } from "@/lib/inventory";
import { useT } from "@/components/shop/lang-provider";

export interface SpecGroup {
  name: string;
  values: string[];
  /** 官方变体级售罄值（禁用 + 划线，默认选中首个有货值） */
  soldOutValues?: string[];
}

export interface BuyPanelProps {
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

const MAX_PRESALE_QTY = 5;

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
    return init;
  });

  const max = isPresale ? Math.min(5, MAX_PRESALE_QTY) : Math.min(99, Math.max(1, stock));
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
                  /* Round swatches — 官方 34px,active 黑环;售罄加正斜杠 */
                  <div className="flex flex-wrap gap-2.5">
                    {g.values.map((v) => {
                      const active = selections[g.name] === v;
                      /* 售罄但**仍可点**：选中后整页按钮切到货提醒（大爷反馈的核心交互）。
                         售罄仅用反斜杠 + title 提示，不 disabled，保证可选中登记到货通知。 */
                      const out = soldOut.includes(v) || disabled;
                      return (
                        <button
                          key={v}
                          type="button"
                          title={out ? `${v} — ${t("Sold out")}` : v}
                          aria-label={`${g.name}: ${v}`}
                          aria-pressed={active}
                          onClick={() => setSelections((s) => ({ ...s, [g.name]: v }))}
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
                  /* Square full-width select — dropdown matches trigger width,
                     anchored directly below it (official behaviour) */
                  <Select
                    value={selections[g.name] ?? ""}
                    onValueChange={(v) => setSelections((s) => ({ ...s, [g.name]: v }))}
                  >
                    <SelectTrigger
                      aria-label={g.name}
                      className="h-[46px] w-full rounded-none border-input bg-card px-3 text-sm text-foreground focus:outline-none focus-visible:ring-0 data-[state=open]:border-foreground"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent
                      position="popper"
                      sideOffset={2}
                      align="center"
                      className="select-content-full w-[var(--radix-select-trigger-width)] min-w-0 rounded-none border border-input bg-card"
                    >
                      {g.values.map((v) => (
                        <SelectItem
                          key={v}
                          value={v}
                          /* 售罄选项仍可选（选中后切到货提醒） */
                          className="text-sm"
                        >
                          {soldOut.includes(v) ? `${v} — ${t("Sold out")}` : v}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
            阈值单一事实来源 lib/inventory（顾客口径：有货才谈「仅剩 N 件」） */}
        {!isPresale && isScarceInStock(stock) ? (
          <p className="text-[13px] text-foreground/65">{t("Only {n} left", { n: stock })}</p>
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
            stock={stock}
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
