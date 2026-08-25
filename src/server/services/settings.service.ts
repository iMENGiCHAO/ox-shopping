import "server-only";
import { prisma } from "@/lib/prisma";
import { POLICY_DEFAULTS, PolicyKey, getPolicyContent } from "@/lib/policy-defaults";
import { Lang } from "@/lib/shop-i18n";

/**
 * 站点设置：读取 SiteSetting(由管理端 /api/admin/settings 维护)。
 * 前端页脚/头部/SEO/政策页均从这里读取，实现"后台可编辑"。
 */

export type PolicyContentMap = Record<PolicyKey, { zh: string; en: string }>;

export interface SiteSettings {
  siteName: { zh: string; en: string };
  siteDescription: { zh: string; en: string };
  contactEmail: string;
  contactPhone: string;
  icp: string;
  seoKeywords: string;
  /** 全站公告(管理端可编辑)：enabled + 文案，前台头部下方展示 */
  announcementEnabled: boolean;
  announcement: string;
  policies: PolicyContentMap;
}

const DEFAULT_DESCRIPTION_ZH =
  "品质好物，一站购齐。正品保障、极速发货、七天无理由退换，让每一次购物都省心放心。";
const DEFAULT_DESCRIPTION_EN =
  "Quality goods, all in one place. Authentic, fast shipping, 7-day no-reason returns.";

const DEFAULT_SITE_NAME_ZH = "SpaceXAI Shop";
const DEFAULT_SITE_NAME_EN = "MENG Shop";

type PolicyValue = string | { zh?: string; en?: string } | null | undefined;

/** Read a { zh, en } policy value. Legacy string values are treated as `en`. */
function readPolicy(value: PolicyValue, key: PolicyKey): { zh: string; en: string } {
  const fallback = POLICY_DEFAULTS[key];
  if (value == null) return { zh: fallback.zh, en: fallback.en };
  if (typeof value === "string") {
    return { zh: fallback.zh, en: value };
  }
  return {
    zh: typeof value.zh === "string" && value.zh ? value.zh : fallback.zh,
    en: typeof value.en === "string" && value.en ? value.en : fallback.en,
  };
}

/** Get the policy text for a given language — convenience used by the policy pages. */
export function getPolicyText(map: PolicyContentMap, key: PolicyKey, lang: Lang): string {
  return getPolicyContent(key, lang) || map[key][lang] || map[key].en || POLICY_DEFAULTS[key].en;
}

export async function getSiteSettings(): Promise<SiteSettings> {
  const rows = await prisma.siteSetting.findMany();
  const map: Record<string, unknown> = {};
  for (const r of rows) map[r.key] = r.value;

  // siteName/siteDescription — support both string (legacy) and { zh, en }
  function readI18n(
    raw: unknown,
    defaultZh: string,
    defaultEn: string,
  ): { zh: string; en: string } {
    if (typeof raw === "string") return { zh: raw, en: raw };
    if (raw && typeof raw === "object") {
      const obj = raw as { zh?: unknown; en?: unknown };
      return {
        zh: typeof obj.zh === "string" && obj.zh ? obj.zh : defaultZh,
        en: typeof obj.en === "string" && obj.en ? obj.en : defaultEn,
      };
    }
    return { zh: defaultZh, en: defaultEn };
  }

  const siteName = readI18n(map.siteName, DEFAULT_SITE_NAME_ZH, DEFAULT_SITE_NAME_EN);
  const siteDescription = readI18n(
    map.siteDescription,
    DEFAULT_DESCRIPTION_ZH,
    DEFAULT_DESCRIPTION_EN,
  );

  return {
    siteName,
    siteDescription,
    contactEmail:
      typeof map.contactEmail === "string" && map.contactEmail
        ? map.contactEmail
        : "support@example.com",
    contactPhone:
      typeof map.contactPhone === "string" && map.contactPhone ? map.contactPhone : "400-000-0000",
    icp: typeof map.icp === "string" ? map.icp : "",
    seoKeywords: typeof map.seoKeywords === "string" ? map.seoKeywords : "",
    announcementEnabled: map.announcementEnabled === true,
    announcement: typeof map.announcement === "string" ? map.announcement : "",
    policies: {
      privacy: readPolicy(map.policyPrivacy as PolicyValue, "privacy"),
      terms: readPolicy(map.policyTerms as PolicyValue, "terms"),
      refund: readPolicy(map.policyRefund as PolicyValue, "refund"),
      cookies: readPolicy(map.policyCookies as PolicyValue, "cookies"),
    },
  };
}

/** Resolve a setting to the current language's string, with safe fallback. */
export function pickLang<T extends Record<"zh" | "en", string>>(
  value: T,
  lang: Lang,
): string {
  return value[lang] || value.en || value.zh;
}


/* ── 页面横幅(前台大图解耦：后台可配，未配置时回落分类/默认值) ── */

export interface BannerSlotConfig {
  /** 图片 URL；空 = 使用默认来源 */
  image: string;
  /** 点击跳转链接；空 = 分类默认链接 */
  href: string;
  /** 覆盖标题；空 = 显示分类名 */
  title: string;
}

export interface PageBannersConfig {
  homeLeft: BannerSlotConfig;
  homeRight: BannerSlotConfig;
  /** 集合页卡片兜底图 */
  collectionsFallbackImage: string;
}

export const PAGE_BANNERS_KEY = "pageBanners";

const EMPTY_SLOT: BannerSlotConfig = { image: "", href: "", title: "" };

export const DEFAULT_PAGE_BANNERS: PageBannersConfig = {
  homeLeft: { ...EMPTY_SLOT },
  homeRight: { ...EMPTY_SLOT },
  collectionsFallbackImage: "",
};

/** 读取页面横幅配置（容错：损坏数据回退默认） */
export function parsePageBanners(raw: unknown): PageBannersConfig {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_PAGE_BANNERS };
  const m = raw as Record<string, unknown>;
  const slot = (v: unknown): BannerSlotConfig => {
    if (!v || typeof v !== "object") return { ...EMPTY_SLOT };
    const o = v as Record<string, unknown>;
    return {
      image: typeof o.image === "string" ? o.image : "",
      href: typeof o.href === "string" ? o.href : "",
      title: typeof o.title === "string" ? o.title : "",
    };
  };
  return {
    homeLeft: slot(m.homeLeft),
    homeRight: slot(m.homeRight),
    collectionsFallbackImage: typeof m.collectionsFallbackImage === "string" ? m.collectionsFallbackImage : "",
  };
}

export async function getPageBanners(): Promise<PageBannersConfig> {
  try {
    const row = await prisma.siteSetting.findUnique({ where: { key: PAGE_BANNERS_KEY } });
    return parsePageBanners(row?.value);
  } catch {
    return { ...DEFAULT_PAGE_BANNERS };
  }
}
