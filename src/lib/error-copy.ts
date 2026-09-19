/**
 * 错误边界多语文案 —— **不依赖 React Context**。
 *
 * 为什么不用 `useT()`：错误边界可能在 Provider 自身抛错时渲染，
 * 此时 Context 不可用（`global-error.tsx` 更是整个替换了根布局）。
 * 因此这里用「cookie → 浏览器语言」推断，纯函数 + 无副作用。
 *
 * 用法（客户端组件）：
 *   const [lang, setLang] = useState<Lang>("en");
 *   useEffect(() => setLang(detectLang()), []);
 * 初始值固定 "en" 保证 SSR 与首次客户端渲染一致，避免 hydration 不匹配。
 */
export type Lang = "zh" | "en";

export function detectLang(): Lang {
  if (typeof document === "undefined") return "en";
  const m = /(?:^|;\s*)shop-lang=([^;]+)/.exec(document.cookie);
  const cookieVal = m?.[1]?.trim();
  if (cookieVal === "zh" || cookieVal === "en") return cookieVal;
  const nav = typeof navigator !== "undefined" ? navigator.language : "";
  return nav.toLowerCase().startsWith("zh") ? "zh" : "en";
}

export interface ErrorCopy {
  /** 页面级错误标题 */
  title: string;
  body: string;
  /** 账户中心（更聚焦的场景）标题与说明 */
  accountTitle: string;
  accountBody: string;
  retry: string;
  home: string;
  /** 账户中心返回按钮（回到 /account） */
  accountHome: string;
  /** 错误编号前缀，如「错误编号：」 */
  errorIdLabel: string;
}

export const ERROR_COPY: Record<Lang, ErrorCopy> = {
  en: {
    title: "Something went wrong",
    body: "An unexpected error occurred. Please try again in a moment.",
    accountTitle: "Couldn't load this account page",
    accountBody: "Please try again. If the problem persists, contact support.",
    retry: "Try again",
    home: "Back to home",
    accountHome: "Back to account",
    errorIdLabel: "Error ID: ",
  },
  zh: {
    title: "页面出错了",
    body: "系统遇到了一个意外错误，请稍后重试。",
    accountTitle: "账户页面加载失败",
    accountBody: "请稍后重试。如果问题持续，请联系客服。",
    retry: "重试",
    home: "返回首页",
    accountHome: "回到账户首页",
    errorIdLabel: "错误编号：",
  },
};
