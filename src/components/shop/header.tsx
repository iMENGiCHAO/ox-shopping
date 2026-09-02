import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { getSiteSettings, pickLang } from "@/server/services/settings.service";
import { getUnreadCount } from "@/server/services/notification.service";
import { getLang } from "@/lib/shop-i18n-server";
import { CartBadge } from "@/components/shop/cart-badge";
import { CurrencySelect } from "@/components/shop/currency-select";
import { SearchOverlay } from "@/components/shop/search-overlay";
import { UserMenu } from "@/components/shop/user-menu";

/**
 * Site header — faithful shop.x.com replica:
 * pure-black 65px bar, site wordmark LEFT, utilities RIGHT
 * (currency · search · account · cart). No category nav, hide-on-scroll
 * handled by HeaderShell.
 */
export async function Header() {
  const [user, settings] = await Promise.all([getSessionUser(), getSiteSettings()]);
  const lang = await getLang();
  const siteName = pickLang(settings.siteName, lang);
  // 服务端先查未读数 — 首屏 SSR 就能看到 `Account (n)`，避免客户端 mount 后才补上
  const initialUnread = user ? await getUnreadCount(user.id) : 0;

  return (
    <header className="bg-ink text-ink-foreground">
      {/* 公告栏 —— 管理端「站点设置」控制开关与文案，数据直达前台 */}
      {settings.announcementEnabled && settings.announcement ? (
        <div className="border-b border-white/10 bg-ink">
          <div className="container flex min-h-[36px] items-center justify-center px-5 py-1.5 text-center text-[13px] leading-snug text-white/85">
            <span className="line-clamp-2">{settings.announcement}</span>
          </div>
        </div>
      ) : null}
      <div className="header-bar">
        {/* Left logo — 后台自定义品牌LOGO(白色托底保证深色图案可见),否则官方白色X。
            桌面固定左缘 48px；移动端居中（官方实测 375 视口左缘 153px）。 */}
        <Link href="/" aria-label={siteName} className="header-logo">
          {/* 统一 LOGO 尺寸：固定高度等比例缩放（w-auto），
              object-contain 防拉伸变形，max-w 防超宽图挤压右侧工具区 */}
          <img
            src={settings.siteLogoUrl || "/images/brand/logo-header.png"}
            alt={siteName}
            className="h-[44px] w-auto max-w-[200px] object-contain object-left"
          />
        </Link>

        {/* Right utilities — 移动端仅 搜索+购物车（官方）；桌面端 币种+搜索+账号(带消息角标)+购物车 */}
        <div className="header-utils text-sm">
          <div className="header-util-desktop">
            <CurrencySelect />
          </div>
          <SearchOverlay />
          <div className="header-util-desktop">
            <UserMenu user={user} initialUnread={initialUnread} />
          </div>
          <CartBadge />
        </div>
      </div>
    </header>
  );
}
