import Link from "next/link";
import { getSiteSettings, pickLang } from "@/server/services/settings.service";
import { getLang } from "@/lib/shop-i18n-server";
import { localizePath } from "@/lib/shop-i18n";
import { getSessionUser } from "@/lib/auth/session";
import { CartBadge } from "@/components/shop/cart-badge";
import { SearchOverlay } from "@/components/shop/search-overlay";
import { CurrencySelect } from "@/components/shop/currency-select";
import { UserMenu } from "@/components/shop/user-menu";

/**
 * Site header — faithful shop.x.com replica:
 * pure-black bar (59px <700px / 65px ≥700px), wordmark centered <1000px, left-aligned ≥1000px.
 *
 * 响应式三段式（原站实测，断点 700 / 1000）：
 * - <700px    ：仅 Search + Cart 两个图标（空间有限，币种在页脚，登录在结账流程触发）
 * - 700–999px ：Account + Search + Cart 三个图标（仍无币种/文字）
 * - ≥1000px   ：币种(🇺🇸USD ▾) → Login/Account → Search → Cart (n)（全文字，shop.x.com 顺序）
 *
 * 显隐全部由 globals.css 的 `.header-*` 类控制，组件里不再写断点，
 * 保证"顶栏高度 / LOGO 对齐 / 右侧项数"三者始终同步。
 * No category nav, hide-on-scroll handled by HeaderShell.
 */
export async function Header() {
  const settings = await getSiteSettings();
  const lang = await getLang();
  const siteName = pickLang(settings.siteName, lang);
  const user = await getSessionUser();

  return (
    <header className="bg-ink text-ink-foreground">
      <div className="header-bar">
        {/* Left logo — 后台自定义品牌LOGO,否则官方白色X。
            ≥1000px 固定左缘 48px；<1000px 居中（官方实测 375 视口左缘 153px）。 */}
        <Link href={localizePath("/", lang)} aria-label={siteName} className="header-logo">
          {/* 自定义品牌 LOGO：最大高度 44px 等比例缩放(object-contain 防变形)。
              顶栏为纯黑色：上传的 LOGO 若为透明底+黑色图案会"黑图压黑底"不可见，
              服务端已测定图案明度并写入 siteLogoDarkArtwork，偏暗时此处 invert 反白。
              图片本身保持商家上传原样，不改文件。 */}
          <img
            src={settings.siteLogoUrl || "/images/brand/logo-header.png"}
            alt={siteName}
            className={`h-[44px] w-auto max-w-[200px] object-contain object-left${
              settings.siteLogoUrl && settings.siteLogoDarkArtwork ? "invert" : ""
            }`}
          />
        </Link>

        {/* Right utilities — 三段式显隐由 CSS 类控制。
            顺序对齐 shop.x.com：币种 → 登录/账户 → 搜索 → 购物车。 */}
        <div className="header-utils text-sm">
          <span className="header-util-desktop">
            <CurrencySelect withFlag direction="down" />
          </span>
          <UserMenu user={user} />
          <SearchOverlay />
          <CartBadge />
        </div>
      </div>
    </header>
  );
}
