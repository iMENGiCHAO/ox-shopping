import "server-only";

/**
 * XSS 防护(按需加载版)：
 * 前端 React 默认转义文本内容；入库前如需净化富文本，调用 sanitizeHtml / sanitizePlainText。
 *
 * 注意：isomorphic-dompurify(内含 jsdom)体积大且与 Next.js 服务端打包存在
 * CSS 资源解析兼容问题，因此这里使用动态 import 按需加载，避免被页面静态打包。
 */
export async function sanitizeHtml(input: string): Promise<string> {
  const { default: DOMPurify } = await import("isomorphic-dompurify");
  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS: [
      "p",
      "br",
      "strong",
      "em",
      "u",
      "ul",
      "ol",
      "li",
      "h3",
      "h4",
      "blockquote",
      "code",
      "a",
      "img",
    ],
    ALLOWED_ATTR: ["href", "title", "src", "alt", "width", "height", "target", "rel"],
    ALLOW_DATA_ATTR: false,
  });
}

/** 纯文本净化(去除全部 HTML) */
export async function sanitizePlainText(input: string): Promise<string> {
  const { default: DOMPurify } = await import("isomorphic-dompurify");
  return DOMPurify.sanitize(input, { ALLOWED_TAGS: [] });
}
