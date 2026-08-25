import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { getSiteSettings, pickLang } from "@/server/services/settings.service";
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
  const lang = getLang();
  const siteName = pickLang(settings.siteName, lang);

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
      <div className="container flex h-[65px] items-center justify-between gap-4">
        {/* Left logo — 后台自定义品牌LOGO(白色托底保证深色图案可见),否则官方白色X */}
        <Link href="/" aria-label={siteName} className="flex items-center">
          {settings.siteLogoUrl ? (
            /* 白色图案透明底 LOGO:黑底直出 */
            // eslint-disable-next-line @next/next/no-img-element
            <img src={settings.siteLogoUrl} alt={siteName} className="h-[34px] w-auto" />
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src="/images/xcom2/logo-x-white.png"
              alt={siteName}
              width={70}
              height={40}
              className="h-auto w-[70px]"
            />
          )}
        </Link>

        {/* Right utilities — faded white, brighten on hover */}
        <div className="flex items-center gap-4 text-sm sm:gap-5">
          <CurrencySelect />
          <SearchOverlay />
          <UserMenu user={user} />
          <CartBadge />
        </div>
      </div>
    </header>
  );
}
