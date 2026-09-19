import { describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { render } from "@react-email/render";
import { RestockEmail } from "@/emails/templates";

/** 商品卡邮件的核心数据（与 notify-me.service 组装一致） */
const baseProps = {
  siteUrl: "https://shop.example.com",
  siteName: "Ox Shopping",
  name: "张三",
  productName: "Grok Dad Hat",
  variantText: "Color: Black / Size: M",
  image: "https://shop.example.com/img/grok-dad-hat.jpg",
  excerpt: "限定款刺绣棒球帽，做工扎实。",
  priceText: "$35.00",
  compareAtText: "$49.00",
  productUrl: "https://shop.example.com/products/grok-dad-hat",
};

describe("到货提醒邮件（商品卡）", () => {
  it("中文邮件包含完整商品卡：图/名/规格/价格/划线价/紧迫提示/CTA", async () => {
    const html = await render(h(RestockEmail, { ...baseProps, lang: "zh" }));
    expect(html).toContain("Grok Dad Hat");
    expect(html).toContain(`alt="Grok Dad Hat"`);
    expect(html).toContain("Color: Black / Size: M");
    expect(html).toContain("$35.00");
    expect(html).toContain("$49.00");
    expect(html).toContain("库存有限，售完即止");
    expect(html).toContain("立即购买");
    expect(html).toContain('href="https://shop.example.com/products/grok-dad-hat"');
    // 合规尾注（一对一、可忽略）
    expect(html).toContain("您曾登记的到货通知");
  });

  it("英文邮件使用英文文案与 CTA", async () => {
    const html = await render(h(RestockEmail, { ...baseProps, lang: "en" }));
    expect(html).toContain("Shop now");
    // 撇号在 HTML 输出里被实体化为 &#x27;
    expect(html).toContain("Limited stock — once it&#x27;s gone");
    expect(html).toContain("restock notification");
  });

  it("预售商品开售（isPresale）切换「预购开售」口径", async () => {
    const zh = await render(h(RestockEmail, { ...baseProps, lang: "zh", isPresale: true }));
    expect(zh).toContain("您预购的商品已到货开售");
    expect(zh).toContain("预售商品已到货并开售");
    expect(zh).not.toContain("您关注的商品到货啦");

    const en = await render(h(RestockEmail, { ...baseProps, lang: "en", isPresale: true }));
    expect(en).toContain("Pre-order now available");
  });

  it("无图/无划线价时渲染不报错且不出现空图片节点", async () => {
    const html = await render(
      h(RestockEmail, {
        siteUrl: baseProps.siteUrl,
        siteName: baseProps.siteName,
        name: "李四",
        productName: "Plain Tee",
        priceText: "¥199.00",
        productUrl: "https://shop.example.com/products/plain-tee",
        lang: "zh",
      }),
    );
    expect(html).toContain("Plain Tee");
    expect(html).toContain("¥199.00");
    expect(html).not.toContain("img");
  });
});
