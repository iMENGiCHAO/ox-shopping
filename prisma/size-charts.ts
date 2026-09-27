/**
 * 演示品尺码表数据（2026-09-26 数据孤岛迁移）：
 * 此前这份数据内置在前端组件（size-chart-data.tsx）里 —— 后台编辑器为空时前台
 * 仍显示内置表（后台所见≠前台所示），且商品删除后表成幽灵数据。迁移后：
 *   - seed 灌入 product.sizeChart（DB 为唯一事实源，后台编辑直接生效）
 *   - PDP/搜索只读 DB，无隐藏注册表
 * 数据抓取自 上游参考站 官方页面（与演示品目录 demo-catalog 同为演示数据源）。
 */
export interface SizeChartTable {
  headers: string[];
  rows: string[][];
}

const ADULT_XS_3XL = ["Size", "XS", "S", "M", "L", "XL", "2XL", "3XL"];
const KIDS = ["Size", "2T", "4T", "6", "8", "10", "12"];

/** 抓取自 上游参考站 线上（后台逐品配置的镜像） */
export const SIZE_CHARTS: Record<string, SizeChartTable> = {
  /* The Core Tee（/products/ox-core-tee）—— 2026-09-21 从原站 PDP 取回。
     此前注册表里没有它，而 DB 的 sizeChart 也为空 ⇒ `sizeChart` 解析成 null ⇒
     **整个 Size Chart 区块不渲染**（原站在加购按钮下方有一行 `Size Chart` + 折叠区，
     375 下占 1037..1178 ≈ 141px，正是本地 PDP 页高比原站少的量）。 */
  "ox-core-tee": {
    headers: ADULT_XS_3XL,
    rows: [
      ["Chest", `40"`, `41"`, `43.4"`, `44.9"`, `47.2"`, `48.8"`, `51.2"`],
      ["Sleeve Length", `7.8"`, `7.8"`, `8.2"`, `8.6"`, `8.6"`, `8.6"`, `9.4"`],
    ],
  },
  "ox-classic-hoodie": {
    headers: ADULT_XS_3XL,
    rows: [
      ["Chest", `44"`, `46"`, `48"`, `50"`, `52"`, `54"`, `56"`],
      ["Sleeve Length", `22.5"`, `23.5"`, `24.5"`, `25.5"`, `26.5"`, `27.5"`, `28.5"`],
    ],
  },
  "ox-hoodie": {
    headers: ADULT_XS_3XL,
    rows: [
      ["Chest", `44"`, `46"`, `48"`, `50"`, `52"`, `54"`, `56"`],
      ["Sleeve Length", `22.5"`, `23.5"`, `24.5"`, `25.5"`, `26.5"`, `27.5"`, `28.5"`],
    ],
  },
  "ox-core-hoodie": {
    headers: ADULT_XS_3XL,
    rows: [
      ["Chest", `44"`, `46"`, `48"`, `50"`, `52"`, `54"`, `56"`],
      ["Sleeve Length", `22.5"`, `23.5"`, `24.5"`, `25.5"`, `26.5"`, `27.5"`, `28.5"`],
    ],
  },
  "ox-core-crewneck": {
    headers: ADULT_XS_3XL,
    rows: [
      ["Chest", `45"`, `47"`, `49"`, `51"`, `53"`, `55"`, `57"`],
      ["Sleeve Length", `22"`, `23"`, `24"`, `25"`, `26"`, `27"`, `28"`],
    ],
  },
  "ox-retro-crewneck-presale": {
    headers: ADULT_XS_3XL,
    rows: [
      ["Chest", `45"`, `47"`, `49"`, `51"`, `53"`, `55"`, `57"`],
      ["Sleeve Length", `22"`, `23"`, `24"`, `25"`, `26"`, `27"`, `28"`],
    ],
  },
  "ox-reflective-tee": {
    headers: ADULT_XS_3XL,
    rows: [
      ["Chest", `39"`, `41"`, `43"`, `45"`, `47"`, `49"`, `51"`],
      ["Sleeve Length", `7.8"`, `8"`, `8.3"`, `8.5"`, `8.8"`, `9"`, `9.3"`],
    ],
  },
  "ox-graphic-logo-tee": {
    headers: ADULT_XS_3XL,
    rows: [
      ["Chest", `40"`, `41"`, `43.4"`, `44.9"`, `47.2"`, `48.8"`, `51.2"`],
      ["Sleeve Length", `7.8"`, `7.8"`, `8.2"`, `8.6"`, `8.6"`, `8.6"`, `9.4"`],
    ],
  },
  "ox-constellation-tee": {
    headers: ADULT_XS_3XL,
    rows: [
      ["Chest", `40"`, `41"`, `43.4"`, `44.9"`, `47.2"`, `48.8"`, `51.2"`],
      ["Sleeve Length", `7.8"`, `7.8"`, `8.2"`, `8.6"`, `8.6"`, `8.6"`, `9.4"`],
    ],
  },
  "ox-logo-tee": {
    headers: ADULT_XS_3XL,
    rows: [
      ["Chest", `40"`, `41"`, `43.4"`, `44.9"`, `47.2"`, `48.8"`, `51.2"`],
      ["Sleeve Length", `7.8"`, `7.8"`, `8.2"`, `8.6"`, `8.6"`, `8.6"`, `9.4"`],
    ],
  },
  "ox-midnight-graphic-tee": {
    headers: ADULT_XS_3XL,
    rows: [
      ["Chest", `40"`, `41"`, `43.4"`, `44.9"`, `47.2"`, `48.8"`, `51.2"`],
      ["Sleeve Length", `7.8"`, `7.8"`, `8.2"`, `8.6"`, `8.6"`, `8.6"`, `9.4"`],
    ],
  },
  "ox-human-connection-tee": {
    headers: ADULT_XS_3XL,
    rows: [
      ["Chest", `40"`, `41"`, `43.4"`, `44.9"`, `47.2"`, `48.8"`, `51.2"`],
      ["Sleeve Length", `7.8"`, `7.8"`, `8.2"`, `8.6"`, `8.6"`, `8.6"`, `9.4"`],
    ],
  },
  "ox-retro-tee-presale": {
    headers: ADULT_XS_3XL,
    rows: [
      ["Chest", `39"`, `41"`, `43"`, `45"`, `47"`, `49"`, `51"`],
      ["Sleeve Length", `7.8"`, `8"`, `8.3"`, `8.5"`, `8.8"`, `9"`, `9.3"`],
    ],
  },
  "ox-kids-constellation-tee": {
    headers: KIDS,
    rows: [
      ["Chest", `22.8"`, `25.2"`, `27.5"`, `28.75"`, `29.9"`, `31.1"`],
      ["Sleeve Length", `4.5"`, `4.9"`, `5.3"`, `5.5"`, `5.7"`, `5.9"`],
    ],
  },
  "ox-kids-constellation-hoodie": {
    headers: KIDS,
    rows: [
      ["Chest", `31.5"`, `32.25"`, `33"`, `33.75"`, `34.5"`, `35.5"`],
      ["Sleeve Length", `15.25"`, `15.6"`, `16"`, `16.4"`, `16.75"`, `17.1"`],
    ],
  },
};