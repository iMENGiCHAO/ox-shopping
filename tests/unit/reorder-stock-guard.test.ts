import { describe, expect, it } from "vitest";

import { specAvailableQuantity, specKey } from "@/server/services/cart.service";
import type { SpecSelection } from "@/components/shop/types";

/**
 * 「再次购买」库存守卫（业务铁律）：
 *   先判断有没有库存 —— 没有库存就不能加入购物车，有库存才能加入购物车。
 *
 * 单测聚焦规格级库存判断（specAvailableQuantity）：这是 reorder 路由与
 * addToCart / updateCartItem 共用的唯一库存口径。历史回归 bug：
 *   多规格商品的某个颜色/尺码售罄（specStock 里该值为 0 或缺失），
 *   但商品总库存 > 0 —— 旧实现拿总库存兜底，把售罄规格加进了购物车。
 */

const S = (name: string, value: string): SpecSelection => ({ name, value });

const specStock = {
  Color: { Red: 3, Blue: 0 },
  Size: { M: 5 },
};

describe("reorder stock guard · specAvailableQuantity", () => {
  it("规格命中且有库存 → 返回该规格明细库存（不是商品总库存）", () => {
    // 总库存 43（所有颜色之和），Red 只剩 3 —— 加购数量必须按 3 卡
    expect(specAvailableQuantity({ stock: 43, isPresale: false, specStock }, [S("Color", "Red")])).toBe(3);
  });

  it("规格明细为 0 → 返回 0（售罄规格绝不能加购）", () => {
    // 旧 bug：stock=43 > 0 被放行；现在先判规格库存，Blue=0 直接判死
    expect(specAvailableQuantity({ stock: 43, isPresale: false, specStock }, [S("Color", "Blue")])).toBe(0);
  });

  it("组存在但选中的值没有库存记录 → 返回 0（视为售罄，不拿总库存兜底）", () => {
    expect(specAvailableQuantity({ stock: 43, isPresale: false, specStock }, [S("Color", "Green")])).toBe(0);
  });

  it("多规格组合 → 取第一个命中维度的明细（逐组校验，0 即阻断）", () => {
    expect(specAvailableQuantity({ stock: 43, isPresale: false, specStock }, [S("Color", "Red"), S("Size", "M")])).toBe(3);
    expect(specAvailableQuantity({ stock: 43, isPresale: false, specStock }, [S("Color", "Blue"), S("Size", "M")])).toBe(0);
  });

  it("未配置 specStock → 回落商品总库存", () => {
    expect(specAvailableQuantity({ stock: 7, isPresale: false, specStock: null }, [S("Color", "Red")])).toBe(7);
    expect(specAvailableQuantity({ stock: 7, isPresale: false }, [])).toBe(7);
  });

  it("预售商品不受库存约束 → Infinity（0 库存也能 Pre-Order）", () => {
    expect(specAvailableQuantity({ stock: 0, isPresale: true, specStock }, [S("Color", "Blue")])).toBe(Infinity);
  });

  it("specStock 存成字符串数字也按数值解析", () => {
    const strStock = { Color: { Red: "6" } };
    expect(specAvailableQuantity({ stock: 99, isPresale: false, specStock: strStock }, [S("Color", "Red")])).toBe(6);
  });
});

describe("reorder stock guard · 购物车行去重键", () => {
  it("不同规格组合 → 不同行；同规格顺序无关", () => {
    const a = specKey([S("Color", "Red"), S("Size", "M")]);
    const b = specKey([S("Size", "M"), S("Color", "Red")]);
    const c = specKey([S("Color", "Blue"), S("Size", "M")]);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});
