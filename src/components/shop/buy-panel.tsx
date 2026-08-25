"use client";

import { useMemo, useState, type ReactNode } from "react";
import { QuantityInput } from "@/components/shop/quantity-input";
import { AddToCartButton } from "@/components/shop/add-to-cart-button";
import { BuyNowButton } from "@/components/shop/buy-now-button";
import type { SpecSelection } from "@/components/shop/types";
import { cn } from "@/lib/utils";
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
  Black: "#1C1C1C", "Obsidian Black": "#1A1A1A", "Patterned Black": "#2B2B2B",
  Charcoal: "#2D2D2D", "Space Gray": "#3F3F3F", "Dark Grey": "#3F3F3F",
  Silver: "#D4D4D4", "Stellar Silver": "#D4D4D4", White: "#FAFAFA",
  "Glacier Blue": "#A8C5D9", Blue: "#4A6B8A", Navy: "#1F2D3D",
  "Pearl White": "#F5F1EA", Khaki: "#C3B091",
  Red: "#B8434A", Green: "#5A7255", Olive: "#6B6730", Yellow: "#D4A436",
  Gold: "#B8973D", Purple: "#6B4D7A", Pink: "#D4A0B5", Brown: "#6B4A2D",
  /* zh */
  黑色: "#1C1C1C", 白色: "#FAFAFA", 银色: "#D4D4D4", 灰色: "#808080",
  蓝色: "#4A6B8A", 红色: "#B8434A", 绿色: "#5A7255", 黄色: "#D4A436",
  金色: "#B8973D", 粉色: "#D4A0B5", 紫色: "#6B4D7A", 棕色: "#6B4A2D",
  深空灰: "#3F3F3F", 冰川蓝: "#A8C5D9", 曜石黑: "#1A1A1A",
};

function isColorGroup(name: string, values: string[]): boolean {
  if (/colou?r|颜色/i.test(name)) return true;
  return values.every((v) => COLOR_HEX[v] !== undefined);
}

/**
 * Buy panel — shop.x.com replica:
 * color groups render as 56px round swatches (black ring when active);
 * other groups render as a square full-width select; quantity stepper;
 * stacked black 46px CTAs.
 */
export function BuyPanel({
  productId,
  stock,
  isPresale = false,
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
  const disabled = stock <= 0 && !isPresale;

  const selectedAttributes = useMemo<SpecSelection[]>(
    () =>
      selectableAttributes
        .map((g) => ({ name: g.name, value: selections[g.name] ?? g.values[0] ?? "" }))
        .filter((s) => s.value),
    [selectableAttributes, selections],
  );

  return (
    <div className={className}>
      {selectableAttributes.length > 0 ? (
        <div className="space-y-5">
          {selectableAttributes.map((g) => {
            const colorMode = isColorGroup(g.name, g.values);
            const soldOut = g.soldOutValues ?? [];
            return (
              <div key={g.name} className="space-y-2.5">
                <p className="flex items-center gap-3 text-[13px] text-foreground">
                  <span>
                    {g.name}
                    <span className="ml-2 opacity-60">{selections[g.name]}</span>
                  </span>
                </p>
                {colorMode ? (
                  /* Round swatches — 官方 34px,active 黑环;售罄加正斜杠 */
                  <div className="flex flex-wrap gap-2.5">
                    {g.values.map((v) => {
                      const active = selections[g.name] === v;
                      const out = soldOut.includes(v);
                      return (
                        <button
                          key={v}
                          type="button"
                          /* 整件售罄(disabled=true)时仍可选（到货提醒用）；仅部分缺货的值禁点 */
                          disabled={!disabled && out}
                          title={out ? `${v} — ${t("Sold out")}` : v}
                          aria-label={`${g.name}: ${v}`}
                          aria-pressed={active}
                          onClick={() => setSelections((s) => ({ ...s, [g.name]: v }))}
                          className={cn(
                            "relative h-[34px] w-[34px] overflow-hidden rounded-full border p-0 transition-colors",
                            active ? "border-foreground" : "border-transparent hover:border-border",
                            !disabled && out && "cursor-not-allowed",
                          )}
                        >
                          <span
                            className="block h-full w-full rounded-full border border-black/10"
                            style={{ backgroundColor: COLOR_HEX[v] ?? "#D4D4D4" }}
                          />
                          {/* 官方售罄样式：与官方同款渐变画斜线（"/"，被圆形裁切不出头） */}
                          {out ? (
                            <span
                              aria-hidden="true"
                              className="pointer-events-none absolute inset-0 rounded-full"
                              style={{
                                background:
                                  "linear-gradient(to right bottom, transparent calc(50% - 0.5px), #1c1c1c calc(50% - 0.5px), #1c1c1c calc(50% + 0.5px), transparent calc(50% + 0.5px))",
                              }}
                            />
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  /* Square full-width select — sold-out values struck through */
                  <select
                    value={selections[g.name] ?? ""}
                    onChange={(e) => setSelections((s) => ({ ...s, [g.name]: e.target.value }))}
                    className="h-[46px] w-full max-w-xs border border-input bg-card px-3 text-sm text-foreground focus:border-foreground focus:outline-none"
                    aria-label={g.name}
                  >
                    {g.values.map((v) => (
                      <option
                        key={v}
                        value={v}
                        /* 整件售罄时全部可选（到货提醒用）；仅部分缺货的值禁用 */
                        disabled={!disabled && soldOut.includes(v)}
                      >
                        {soldOut.includes(v) ? `${v} — ${t("Sold out")}` : v}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            );
          })}
        </div>
      ) : null}

      {/* 官方顺序：描述位于规格之后、数量行之前 */}
      {descriptionSlot}

      <div className="mt-8 flex items-center gap-3">
        
        <QuantityInput
          value={quantity}
          min={1}
          max={max}
          onChange={setQuantity}
          disabled={disabled}
        />
      </div>
      {isPresale ? (
        <p className="mt-4 border border-border bg-secondary px-3 py-2 text-[13px] text-foreground/80">
          {t("Pre-order item — ships within 14 days of payment")}
        </p>
      ) : null}
      <div className="mt-5 flex flex-col gap-3">
        {/* 对齐官方 PDP：有货仅 Add to Bag；售罄（非预售）仅 Notify me */}
        {disabled && !isPresale ? null : (
          <AddToCartButton
            productId={productId}
            quantity={quantity}
            attributes={selectedAttributes}
            disabled={disabled}
            className="h-[46px] w-full text-[15px]"
          />
        )}
        {disabled && !isPresale ? (
          <BuyNowButton
            productId={productId}
            quantity={quantity}
            attributes={selectedAttributes}
            disabled={disabled}
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
