/**
 * 结账页「国家/地区」数据。
 *
 * 为什么需要这个模块：原站结账页（Shopify checkout）的收货地址表单是**分国别**的——
 * 美国只显示 Country/Region + 名 + 姓 + 地址 + 公寓 + 城市 + 州 + 邮编，
 * 而中国大陆/香港/日本等地会**额外要求手机号**（当地承运商必需），
 * 州/省字段在美国/加拿大是下拉框、其他国家是文本框。
 *
 * 因此表单不能写死一套字段，必须由所选国家驱动。默认国家 = 美国（与原站一致），
 * 保证默认形态与原站逐像素一致。
 *
 * 约定：
 *   - `phone: true` 表示该国家/地区**必须**填手机号（表单会显示并校验）
 *   - `states` 存在时，州/省字段渲染为下拉框；否则为文本框
 */

export interface CountryDef {
  /** ISO 3166-1 alpha-2 */
  code: string;
  /** 英文国名（与订单快照 country 字段同口径，便于承运商面单直接使用） */
  name: string;
  /** 中文国名 */
  nameZh: string;
  /** 是否强制填写手机号 */
  phone: boolean;
  /** 一级行政区（州/省）；存在则渲染为下拉框 */
  states?: { code: string; name: string; nameZh?: string }[];
}

/** 美国州 + 哥伦比亚特区 */
const US_STATES = ([
  ["AL", "Alabama", "阿拉巴马州"],
  ["AK", "Alaska", "阿拉斯加州"],
  ["AZ", "Arizona", "亚利桑那州"],
  ["AR", "Arkansas", "阿肯色州"],
  ["CA", "California", "加利福尼亚州"],
  ["CO", "Colorado", "科罗拉多州"],
  ["CT", "Connecticut", "康涅狄格州"],
  ["DE", "Delaware", "特拉华州"],
  ["DC", "District of Columbia", "哥伦比亚特区"],
  ["FL", "Florida", "佛罗里达州"],
  ["GA", "Georgia", "佐治亚州"],
  ["HI", "Hawaii", "夏威夷州"],
  ["ID", "Idaho", "爱达荷州"],
  ["IL", "Illinois", "伊利诺伊州"],
  ["IN", "Indiana", "印第安纳州"],
  ["IA", "Iowa", "艾奥瓦州"],
  ["KS", "Kansas", "堪萨斯州"],
  ["KY", "Kentucky", "肯塔基州"],
  ["LA", "Louisiana", "路易斯安那州"],
  ["ME", "Maine", "缅因州"],
  ["MD", "Maryland", "马里兰州"],
  ["MA", "Massachusetts", "马萨诸塞州"],
  ["MI", "Michigan", "密歇根州"],
  ["MN", "Minnesota", "明尼苏达州"],
  ["MS", "Mississippi", "密西西比州"],
  ["MO", "Missouri", "密苏里州"],
  ["MT", "Montana", "蒙大拿州"],
  ["NE", "Nebraska", "内布拉斯加州"],
  ["NV", "Nevada", "内华达州"],
  ["NH", "New Hampshire", "新罕布什尔州"],
  ["NJ", "New Jersey", "新泽西州"],
  ["NM", "New Mexico", "新墨西哥州"],
  ["NY", "New York", "纽约州"],
  ["NC", "North Carolina", "北卡罗来纳州"],
  ["ND", "North Dakota", "北达科他州"],
  ["OH", "Ohio", "俄亥俄州"],
  ["OK", "Oklahoma", "俄克拉何马州"],
  ["OR", "Oregon", "俄勒冈州"],
  ["PA", "Pennsylvania", "宾夕法尼亚州"],
  ["RI", "Rhode Island", "罗得岛州"],
  ["SC", "South Carolina", "南卡罗来纳州"],
  ["SD", "South Dakota", "南达科他州"],
  ["TN", "Tennessee", "田纳西州"],
  ["TX", "Texas", "得克萨斯州"],
  ["UT", "Utah", "犹他州"],
  ["VT", "Vermont", "佛蒙特州"],
  ["VA", "Virginia", "弗吉尼亚州"],
  ["WA", "Washington", "华盛顿州"],
  ["WV", "West Virginia", "西弗吉尼亚州"],
  ["WI", "Wisconsin", "威斯康星州"],
  ["WY", "Wyoming", "怀俄明州"],
] as [string, string, string][]).map(([code, name, nameZh]) => ({ code, name, nameZh }));

/** 加拿大省/地区 */
const CA_PROVINCES = ([
  ["AB", "Alberta", "艾伯塔省"],
  ["BC", "British Columbia", "不列颠哥伦比亚省"],
  ["MB", "Manitoba", "曼尼托巴省"],
  ["NB", "New Brunswick", "新不伦瑞克省"],
  ["NL", "Newfoundland and Labrador", "纽芬兰与拉布拉多省"],
  ["NS", "Nova Scotia", "新斯科舍省"],
  ["NT", "Northwest Territories", "西北地区"],
  ["NU", "Nunavut", "努纳武特地区"],
  ["ON", "Ontario", "安大略省"],
  ["PE", "Prince Edward Island", "爱德华王子岛省"],
  ["QC", "Quebec", "魁北克省"],
  ["SK", "Saskatchewan", "萨斯喀彻温省"],
  ["YT", "Yukon", "育空地区"],
] as [string, string, string][]).map(([code, name, nameZh]) => ({ code, name, nameZh }));

/**
 * 可配送国家/地区清单。
 * 排序按「常用市场优先」，与原站一样把 United States 放在首位作为默认值。
 */
export const COUNTRIES: CountryDef[] = [
  { code: "US", name: "United States", nameZh: "美国", phone: false, states: US_STATES },
  { code: "CN", name: "China", nameZh: "中国大陆", phone: true },
  { code: "HK", name: "Hong Kong SAR, China", nameZh: "中国香港", phone: true },
  { code: "MO", name: "Macao SAR, China", nameZh: "中国澳门", phone: true },
  { code: "TW", name: "Taiwan, China", nameZh: "中国台湾", phone: true },
  { code: "JP", name: "Japan", nameZh: "日本", phone: true },
  { code: "KR", name: "South Korea", nameZh: "韩国", phone: true },
  { code: "SG", name: "Singapore", nameZh: "新加坡", phone: true },
  { code: "MY", name: "Malaysia", nameZh: "马来西亚", phone: true },
  { code: "TH", name: "Thailand", nameZh: "泰国", phone: true },
  { code: "VN", name: "Vietnam", nameZh: "越南", phone: true },
  { code: "PH", name: "Philippines", nameZh: "菲律宾", phone: true },
  { code: "ID", name: "Indonesia", nameZh: "印度尼西亚", phone: true },
  { code: "IN", name: "India", nameZh: "印度", phone: true },
  { code: "AE", name: "United Arab Emirates", nameZh: "阿联酋", phone: true },
  { code: "SA", name: "Saudi Arabia", nameZh: "沙特阿拉伯", phone: true },
  { code: "IL", name: "Israel", nameZh: "以色列", phone: true },
  { code: "TR", name: "Türkiye", nameZh: "土耳其", phone: true },
  { code: "CA", name: "Canada", nameZh: "加拿大", phone: false, states: CA_PROVINCES },
  { code: "MX", name: "Mexico", nameZh: "墨西哥", phone: true },
  { code: "BR", name: "Brazil", nameZh: "巴西", phone: true },
  { code: "GB", name: "United Kingdom", nameZh: "英国", phone: false },
  { code: "IE", name: "Ireland", nameZh: "爱尔兰", phone: false },
  { code: "DE", name: "Germany", nameZh: "德国", phone: false },
  { code: "FR", name: "France", nameZh: "法国", phone: false },
  { code: "IT", name: "Italy", nameZh: "意大利", phone: false },
  { code: "ES", name: "Spain", nameZh: "西班牙", phone: false },
  { code: "PT", name: "Portugal", nameZh: "葡萄牙", phone: false },
  { code: "NL", name: "Netherlands", nameZh: "荷兰", phone: false },
  { code: "BE", name: "Belgium", nameZh: "比利时", phone: false },
  { code: "LU", name: "Luxembourg", nameZh: "卢森堡", phone: false },
  { code: "AT", name: "Austria", nameZh: "奥地利", phone: false },
  { code: "CH", name: "Switzerland", nameZh: "瑞士", phone: false },
  { code: "SE", name: "Sweden", nameZh: "瑞典", phone: false },
  { code: "NO", name: "Norway", nameZh: "挪威", phone: false },
  { code: "DK", name: "Denmark", nameZh: "丹麦", phone: false },
  { code: "FI", name: "Finland", nameZh: "芬兰", phone: false },
  { code: "PL", name: "Poland", nameZh: "波兰", phone: false },
  { code: "CZ", name: "Czechia", nameZh: "捷克", phone: false },
  { code: "HU", name: "Hungary", nameZh: "匈牙利", phone: false },
  { code: "RO", name: "Romania", nameZh: "罗马尼亚", phone: false },
  { code: "GR", name: "Greece", nameZh: "希腊", phone: false },
  { code: "AU", name: "Australia", nameZh: "澳大利亚", phone: false },
  { code: "NZ", name: "New Zealand", nameZh: "新西兰", phone: false },
  { code: "ZA", name: "South Africa", nameZh: "南非", phone: true },
  { code: "EG", name: "Egypt", nameZh: "埃及", phone: true },
  { code: "NG", name: "Nigeria", nameZh: "尼日利亚", phone: true },
  { code: "KE", name: "Kenya", nameZh: "肯尼亚", phone: true },
];

/** 结账页默认国家（与原站一致：美国） */
export const DEFAULT_COUNTRY = "US";

export function getCountry(code: string | null | undefined): CountryDef {
  const found = COUNTRIES.find((c) => c.code === code);
  return found ?? (COUNTRIES[0] as CountryDef);
}

/** 按语言取国名 */
export function countryName(code: string, lang: "zh" | "en"): string {
  const c = getCountry(code);
  return lang === "zh" ? c.nameZh : c.name;
}

/** 该国是否需要强制手机号 */
export function countryRequiresPhone(code: string): boolean {
  return getCountry(code).phone;
}

/** 该国的一级行政区下拉项（无则返回空数组 = 用文本框） */
export function countryStates(code: string): { code: string; name: string; nameZh?: string }[] {
  return getCountry(code).states ?? [];
}
