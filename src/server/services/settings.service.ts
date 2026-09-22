import "server-only";
import { prisma } from "@/lib/prisma";
import { POLICY_DEFAULTS, PolicyKey, getPolicyContent } from "@/lib/policy-defaults";
import { Lang } from "@/lib/shop-i18n";
import { logger } from "@/lib/logger";
import { isLogoArtworkDark } from "@/lib/logo-contrast";
import { cacheGet, cacheSet, cacheDel } from "@/lib/cache";
import { env, brandFallback, supportEmailFallback } from "@/lib/env";
import { LOW_STOCK_THRESHOLD } from "@/lib/inventory";

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
  /** 品牌LOGO(后台可上传更换);空=使用内置默认 */
  siteLogoUrl: string | null;
  /** LOGO 图案偏暗（黑色图案+透明底），黑色顶栏需反白显示；由 lib/logo-contrast 自动测定 */
  siteLogoDarkArtwork: boolean;
  /**
   * 预售商品缺省提示文案（多语言）。
   * 站级默认 — 任何 isPresale=true 但自身未配置 presaleNoteZh/En 的商品都显示这条。
   * 后台「设置」或「商品详情」可改。
   */
  presaleNote: { zh: string; en: string };
  /**
   * 库存预警阈值（运营口径：stock ≤ 阈值计入低库存）。
   * 后台「设置」可改（SiteSetting.lowStockThreshold）；缺省取 lib/inventory。
   * 仪表盘低库存计数与后台商品低库存筛选共用此值，保证口径一致。
   */
  lowStockThreshold: number;
  policies: PolicyContentMap;
}

const DEFAULT_DESCRIPTION_ZH =
  "品质好物，一站购齐。正品保障、极速发货、七天无理由退换，让每一次购物都省心放心。";
const DEFAULT_DESCRIPTION_EN =
  "Quality goods, all in one place. Authentic, fast shipping, 7-day no-reason returns.";

/**
 * 品牌名兜底 —— 统一取 lib/env 的 `brandFallback`（`SITE_NAME` 环境变量 → 内置默认）。
 * 不要再在此处写死字面量：SEO 元数据 / 发票 / 邮件 / PayPal 收银台都汇到这一处。
 */
const DEFAULT_SITE_NAME_ZH = brandFallback;
const DEFAULT_SITE_NAME_EN = brandFallback;

/** 站级默认预售提示 — 任何 isPresale=true 但商品级未覆盖时使用。
 *  后台「设置 → 预售提示」可改；商品级可在编辑商品时单独覆盖。 */
const DEFAULT_PRESALE_NOTE_ZH = "预售商品 — 付款后 14 天内发货";
const DEFAULT_PRESALE_NOTE_EN = "Pre-order item — ships within 14 days of payment";

type PolicyValue = string | { zh?: string; en?: string } | null | undefined;

/** Read a { zh, en } policy value. Legacy string values apply to both languages
 *  (same semantics as readI18n below) — the admin editor now always saves { zh, en }. */
function readPolicy(value: PolicyValue, key: PolicyKey): { zh: string; en: string } {
  const fallback = POLICY_DEFAULTS[key];
  if (value == null) return { zh: fallback.zh, en: fallback.en };
  if (typeof value === "string") return { zh: value, en: value };
  return {
    zh: typeof value.zh === "string" && value.zh ? value.zh : fallback.zh,
    en: typeof value.en === "string" && value.en ? value.en : fallback.en,
  };
}

/** 库存预警阈值：后台可配（0–999 整数）；非法/缺失回退 lib/inventory 缺省值 */
function clampThreshold(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) {
    return Math.min(999, Math.floor(raw));
  }
  return LOW_STOCK_THRESHOLD;
}

/**
 * Get the policy text for a given language — convenience used by the policy pages.
 * 优先级:后台自定义(当前语言) > 后台自定义(另一语言) > 内置默认。
 * 后台「法务页面」保存的内容必须能即时生效,不得被内置默认遮蔽。
 */
export function getPolicyText(map: PolicyContentMap, key: PolicyKey, lang: Lang): string {
  const custom = map?.[key];
  if (custom) {
    const otherLang: Lang = lang === "zh" ? "en" : "zh";
    return custom[lang] || custom[otherLang] || getPolicyContent(key, lang);
  }
  return getPolicyContent(key, lang);
}

export async function getSiteSettings(): Promise<SiteSettings> {
  // 缓存命中：站点设置几乎每个页面都要读(页头/页脚/SEO)，是并发热路径。
  // 短 TTL 缓存避免每次请求都打 DB(高并发下避免连接池/锁阻塞)；
  // 管理端写入设置时通过 invalidateSettingsCache() 立即失效，改动近实时生效。
  const cached = await cacheGet<SiteSettings>(SETTINGS_CACHE_KEY);
  if (cached) return cached;

  const settings = await computeSiteSettings();
  // 计算失败返回内置默认值时也缓存，避免 DB 抖动导致请求洪峰
  await cacheSet(SETTINGS_CACHE_KEY, settings, SETTINGS_CACHE_TTL);
  return settings;
}

/** 站点设置缓存 key（供管理端写入后失效） */
export const SETTINGS_CACHE_KEY = "settings:v1";
/** 站点设置缓存 TTL（秒）——短 TTL 兼顾实时性与并发保护 */
export const SETTINGS_CACHE_TTL = 30;

/** 失效站点设置缓存 —— 任何修改 siteSetting 的路由都应调用 */
export async function invalidateSettingsCache(): Promise<void> {
  await cacheDel(SETTINGS_CACHE_KEY);
}

async function computeSiteSettings(): Promise<SiteSettings> {
  // DB 故障降级：页头/页脚是每个页面的必经之路，站点设置读不到时
  // 返回内置默认值，保证全站其余部分仍可渲染（而非整站 500 白屏）。
  let rows: { key: string; value: unknown }[];
  try {
    rows = await prisma.siteSetting.findMany();
  } catch (err) {
    // 用 warn 而非 error：这是预期降级路径（DB 暂不可用 / 表未迁移），不是真错。
    // Next 16 devtools 会监听 console.error 并标红，污染浏览器控制台。
    logger.warn({ err: (err as Error).message }, "[settings] 站点设置读取失败，使用默认值");
    rows = [];
  }
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

  // ── LOGO 明度（黑色顶栏自动反白）──
  // 正常情况下由管理端保存 LOGO 时写入；对"先上传后才有本机制"的历史数据，
  // 这里首次读取时补测一次并落库，之后走DB直读，不在热路径上重复跑 sharp。
  const siteLogoUrl =
    typeof map.siteLogoUrl === "string" && map.siteLogoUrl ? map.siteLogoUrl : null;
  let siteLogoDarkArtwork = map.siteLogoDarkArtwork === true;
  if (siteLogoUrl && typeof map.siteLogoDarkArtwork !== "boolean") {
    const dark = await isLogoArtworkDark(siteLogoUrl);
    if (dark !== null) {
      siteLogoDarkArtwork = dark;
      // 尽力而为落库，失败不影响本次响应
      prisma.siteSetting
        .upsert({
          where: { key: "siteLogoDarkArtwork" },
          update: { value: dark },
          create: { key: "siteLogoDarkArtwork", value: dark },
        })
        .catch((err) => logger.warn({ err }, "[settings] LOGO 明度标记落库失败"));
    }
  }

  return {
    siteName,
    siteDescription,
    /* 客服联系方式：后台配置 > 环境变量兜底（SUPPORT_EMAIL / MAIL_FROM 发件地址）。
       不再回落到 `support@example.com` / `400-000-0000` —— 占位地址一旦上线，
       FAQ、发票、隐私选择页都会带着它发给真实客户。 */
    contactEmail:
      typeof map.contactEmail === "string" && map.contactEmail.trim()
        ? map.contactEmail.trim()
        : env.SUPPORT_EMAIL.trim() || supportEmailFallback,
    contactPhone:
      typeof map.contactPhone === "string" && map.contactPhone.trim()
        ? map.contactPhone.trim()
        : env.SUPPORT_PHONE.trim(),
    icp: typeof map.icp === "string" ? map.icp : "",
    seoKeywords: typeof map.seoKeywords === "string" ? map.seoKeywords : "",
    siteLogoUrl,
    siteLogoDarkArtwork,
    presaleNote: readI18n(map.presaleNote, DEFAULT_PRESALE_NOTE_ZH, DEFAULT_PRESALE_NOTE_EN),
    lowStockThreshold: clampThreshold(map.lowStockThreshold),
    policies: {
      accessibility: readPolicy(map.policyAccessibility as PolicyValue, "accessibility"),
      privacy: readPolicy(map.policyPrivacy as PolicyValue, "privacy"),
      terms: readPolicy(map.policyTerms as PolicyValue, "terms"),
      refund: readPolicy(map.policyRefund as PolicyValue, "refund"),
      cookies: readPolicy(map.policyCookies as PolicyValue, "cookies"),
      dataSharingOptOut: readPolicy(
        map.policyDataSharingOptOut as PolicyValue,
        "dataSharingOptOut",
      ),
    },
  };
}

/** Resolve a setting to the current language's string, with safe fallback. */
export function pickLang<T extends Record<"zh" | "en", string>>(value: T, lang: Lang): string {
  return value[lang] || value.en || value.zh;
}
