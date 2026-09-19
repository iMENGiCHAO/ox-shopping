import Link from "next/link";
import { CurrencySelect } from "@/components/shop/currency-select";
import { getT, getLang } from "@/lib/shop-i18n-server";
import { getSiteSettings, pickLang } from "@/server/services/settings.service";
import { FOOTER_LINKS } from "@/lib/footer-nav";

/** 页脚链接的统一外观：15px / 行高 24.75px / 65% 不透明度，hover 提亮 */
const LINK_CLASS =
  "text-[15px] leading-[24.75px] opacity-65 outline-none transition-opacity hover:opacity-100 focus-visible:underline focus-visible:underline-offset-4 focus-visible:[box-shadow:none] focus-visible:[outline:none]";

/**
 * Site footer —— shop.x.com 同构，**两行**结构（1200 视口逐像素实测）：
 *   行 1：链接行（居中、水平间距 24px、字号 15px）
 *   行 2：国家/币种选择器 + 版权（**品牌在前**，如 `Ox Shopping © 2026`）
 *
 * 垂直节奏：padding-top 62 / 两行间距 54 / padding-bottom 52（总高 211），
 * 全部来自 `--footer-*` 令牌（globals.css），页面里不出现像素魔数。
 *
 * 链接集与顺序见 `src/lib/footer-nav.ts`（单一事实来源）。
 * 站名/ICP 从 SiteSetting 读取（管理员可在后台修改），版权不写死品牌。
 */
export async function Footer() {
  const t = await getT();
  const lang = await getLang();
  const settings = await getSiteSettings();
  const siteName = pickLang(settings.siteName, lang);
  const year = new Date().getFullYear();

  return (
    <footer className="bg-ink text-ink-foreground">
      <div className="shell pb-[var(--footer-pb)] pt-[var(--footer-pt)] text-center">
        <nav
          aria-label={t("Footer")}
          className="flex flex-wrap items-center justify-center gap-x-[var(--footer-link-gap)] gap-y-4"
        >
          {FOOTER_LINKS.map((link) =>
            link.external ? (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className={LINK_CLASS}
              >
                {t(link.labelKey)}
              </a>
            ) : link.hard ? (
              /* 原生 <a> 全页导航：Cookie Consent 需要目标页重新挂载才能重开横幅 */
              <a key={link.href} href={link.href} className={LINK_CLASS}>
                {t(link.labelKey)}
              </a>
            ) : (
              <Link key={link.href} href={link.href} className={LINK_CLASS}>
                {t(link.labelKey)}
              </Link>
            ),
          )}
        </nav>

        <div className="mt-[var(--footer-row-gap)] flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-6">
          <CurrencySelect showCountry align="center" direction="up" />
          <p className="text-xs opacity-65">
            {siteName} © {year}
            {settings.icp ? ` · ${settings.icp}` : null}
          </p>
        </div>
      </div>
    </footer>
  );
}
