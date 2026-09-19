import "server-only";
import PDFDocument from "pdfkit";
import path from "node:path";
import fs from "node:fs";
import { env, brandFallback } from "@/lib/env";
import { formatMoney, dateString } from "@/lib/utils";

/**
 * 发票 PDF（pdfkit + Noto Sans CJK 字体）
 * 覆盖：订单号、日期、收货地址、商品明细、小计/折扣/运费/税额/合计。
 *
 * 字体路径：可通过 INVOICE_FONT_PATH 环境变量覆盖；默认从 public/fonts 加载。
 * 字体缺失时显式抛出（避免静默使用 Helvetica 渲染中文乱码），
 * 业务方可在 /api/orders/[orderNumber]/invoice 路由里 catch 后回退返回 HTML 收据。
 *
 * 多语 + 品牌：所有文案按 `lang` 取（zh/en 两套），品牌名由调用方从
 * SiteSetting 传入（`siteName`），本文件不写死任何品牌或语言。
 */

const DEFAULT_FONT_PATH = path.join(process.cwd(), "public", "fonts", "NotoSansCJKsc-Regular.otf");
const FONT_NAME = "NotoSansCJK";

export type InvoiceLang = "zh" | "en";

export interface InvoiceCopy {
  title: (brand: string) => string;
  generatedAt: (d: string) => string;
  orderNumber: string;
  placedAt: string;
  customer: string;
  shipTo: string;
  colProduct: string;
  colSku: string;
  colPrice: string;
  colQty: string;
  colSubtotal: string;
  subtotal: string;
  discount: string;
  shipping: string;
  tax: string;
  total: string;
  thanks: string;
  /** toLocaleString 使用的 locale */
  locale: string;
}

export const INVOICE_COPY: Record<InvoiceLang, InvoiceCopy> = {
  zh: {
    title: (brand) => `${brand} 发票`,
    generatedAt: (d) => `INVOICE · 生成时间 ${d}`,
    orderNumber: "订单号：",
    placedAt: "下单时间：",
    customer: "客户：",
    shipTo: "收货地址：",
    colProduct: "商品",
    colSku: "SKU",
    colPrice: "单价",
    colQty: "数量",
    colSubtotal: "小计",
    subtotal: "小计",
    discount: "折扣",
    shipping: "运费",
    tax: "税费",
    total: "合计",
    thanks: "感谢您的惠顾！本发票由系统自动生成，如有疑问请联系客服。",
    locale: "zh-CN",
  },
  en: {
    title: (brand) => `${brand} Invoice`,
    generatedAt: (d) => `INVOICE · Generated ${d}`,
    orderNumber: "Order number: ",
    placedAt: "Placed at: ",
    customer: "Customer: ",
    shipTo: "Ship to: ",
    colProduct: "Product",
    colSku: "SKU",
    colPrice: "Unit price",
    colQty: "Qty",
    colSubtotal: "Subtotal",
    subtotal: "Subtotal",
    discount: "Discount",
    shipping: "Shipping",
    tax: "Tax",
    total: "Total",
    thanks:
      "Thank you for your order. This invoice was generated automatically — contact support if you have any questions.",
    locale: "en-US",
  },
};

function resolveFontPath(): string {
  const override = process.env.INVOICE_FONT_PATH;
  if (override && fs.existsSync(override)) return override;
  if (fs.existsSync(DEFAULT_FONT_PATH)) return DEFAULT_FONT_PATH;
  // 不再静默回退 Helvetica —— 暴露问题给运维处理
  throw new Error(
    `中文字体未找到：${DEFAULT_FONT_PATH}（可通过 INVOICE_FONT_PATH 环境变量覆盖）`,
  );
}

export interface InvoiceInput {
  orderNumber: string;
  createdAt: Date;
  currency: string;
  subtotal: number;
  shippingFee: number;
  tax: number;
  discount: number;
  total: number;
  customerName: string;
  customerEmail: string;
  /** 发票抬头品牌名（来自 SiteSetting）；缺省时回落到站点名兜底 */
  siteName?: string;
  /** 发票语言；缺省 en（与商城默认语言一致） */
  lang?: InvoiceLang;
  address?: {
    recipientName?: string;
    phone?: string;
    province?: string;
    city?: string;
    district?: string;
    detail?: string;
  } | null;
  items: { productName: string; sku: string; price: number; quantity: number; subtotal: number }[];
}

export function generateInvoicePdf(input: InvoiceInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    try {
      const fontPath = resolveFontPath();
      doc.registerFont(FONT_NAME, fontPath);
    } catch (err) {
      // 业务方应在路由层捕获 → 返回 HTML 收据或英文版；
      // 这里再次抛出中断 PDF 生成，避免静默中文乱码。
      reject(err);
      return;
    }

    const lang: InvoiceLang = input.lang ?? "en";
    const c = INVOICE_COPY[lang];
    const brand = input.siteName?.trim() || brandFallback;

    const F = FONT_NAME;
    doc.font(F);

    // 头部
    doc.fontSize(22).text(c.title(brand), { align: "center" });
    doc.moveDown(0.4);
    doc
      .fontSize(9)
      .fillColor("#6b7280")
      .text(c.generatedAt(dateString(new Date())), {
        align: "center",
      });
    doc.moveDown(1);

    // 订单信息
    doc.fontSize(10).fillColor("#111827");
    doc.text(`${c.orderNumber}${input.orderNumber}`);
    doc.text(`${c.placedAt}${input.createdAt.toLocaleString(c.locale, { hour12: false })}`);
    doc.text(`${c.customer}${input.customerName} (${input.customerEmail})`);
    if (input.address) {
      const a = input.address;
      doc.text(
        `${c.shipTo}${a.province ?? ""}${a.city ?? ""}${a.district ?? ""}${a.detail ?? ""} (${a.recipientName ?? ""} ${a.phone ?? ""})`,
      );
    }
    doc.moveDown(1);

    // 商品明细表
    const tableTop = doc.y;
    const cols = { name: 48, sku: 260, price: 360, qty: 430, subtotal: 470 };
    doc.fontSize(9).fillColor("#6b7280");
    doc.text(c.colProduct, cols.name, tableTop);
    doc.text(c.colSku, cols.sku, tableTop);
    doc.text(c.colPrice, cols.price, tableTop, { width: 50, align: "right" });
    doc.text(c.colQty, cols.qty, tableTop, { width: 30, align: "right" });
    doc.text(c.colSubtotal, cols.subtotal, tableTop, { width: 60, align: "right" });
    doc.moveDown(0.4);
    doc.moveTo(48, doc.y).lineTo(547, doc.y).strokeColor("#d1d5db").stroke();
    doc.moveDown(0.4);

    doc.fontSize(9).fillColor("#111827");
    for (const item of input.items) {
      const y = doc.y;
      doc.text(item.productName, cols.name, y, { width: 200, ellipsis: true });
      doc.text(item.sku, cols.sku, y, { width: 90, ellipsis: true });
      doc.text(formatMoney(item.price, input.currency), cols.price, y, {
        width: 50,
        align: "right",
      });
      doc.text(String(item.quantity), cols.qty, y, { width: 30, align: "right" });
      doc.text(formatMoney(item.subtotal, input.currency), cols.subtotal, y, {
        width: 60,
        align: "right",
      });
      doc.moveDown(0.9);
      if (doc.y > 700) doc.addPage();
    }

    // 合计
    doc.moveDown(0.6);
    const rightX = 470;
    const line = (label: string, value: string, bold = false) => {
      doc.fontSize(bold ? 12 : 10).fillColor(bold ? "#111827" : "#374151");
      doc.text(label, 360, doc.y);
      doc.text(value, rightX, doc.y - (bold ? 14 : 12), { width: 80, align: "right" });
      doc.moveDown(bold ? 1.1 : 0.7);
    };
    line(c.subtotal, formatMoney(input.subtotal, input.currency));
    if (input.discount > 0) line(c.discount, `-${formatMoney(input.discount, input.currency)}`);
    line(c.shipping, formatMoney(input.shippingFee, input.currency));
    if (input.tax > 0) line(c.tax, formatMoney(input.tax, input.currency));
    doc
      .moveTo(360, doc.y - 6)
      .lineTo(547, doc.y - 6)
      .strokeColor("#d1d5db")
      .stroke();
    line(c.total, formatMoney(input.total, input.currency), true);

    // 页脚
    doc.moveDown(2);
    doc.fontSize(8).fillColor("#9ca3af").text(c.thanks, { align: "center" });
    doc.text(`${brand} · ${env.SITE_URL}`, { align: "center" });

    doc.end();
  });
}
