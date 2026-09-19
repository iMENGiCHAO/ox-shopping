
/**
 * Size Chart — shop.x.com 官方同构。
 * 官方为后台逐品配置（Shopify metafield）：仅配置了的商品显示，位置在 PDP 左列大图下方；
 * toggle 为 CSS 绘制的加号 "animated-plus"，展开时旋转 45° 呈关闭态；
 * 表格 15px、行 hairline #DDD、英寸值。以下数据全部抓取自官方线上页面。
 */
export interface SizeChartTable {
  headers: string[];
  rows: string[][];
}

const ADULT_XS_3XL = ["Size", "XS", "S", "M", "L", "XL", "2XL", "3XL"];
const KIDS = ["Size", "2T", "4T", "6", "8", "10", "12"];

/** 抓取自 shop.x.com 线上（后台逐品配置的镜像） */
const SIZE_CHARTS: Record<string, SizeChartTable> = {
  "the-xai-hoodie": {
    headers: ADULT_XS_3XL,
    rows: [
      ["Chest", `44"`, `46"`, `48"`, `50"`, `52"`, `54"`, `56"`],
      ["Sleeve Length", `22.5"`, `23.5"`, `24.5"`, `25.5"`, `26.5"`, `27.5"`, `28.5"`],
    ],
  },
  "the-grok-hoodie": {
    headers: ADULT_XS_3XL,
    rows: [
      ["Chest", `44"`, `46"`, `48"`, `50"`, `52"`, `54"`, `56"`],
      ["Sleeve Length", `22.5"`, `23.5"`, `24.5"`, `25.5"`, `26.5"`, `27.5"`, `28.5"`],
    ],
  },
  "unisex-3d-x-logo-hoodie": {
    headers: ADULT_XS_3XL,
    rows: [
      ["Chest", `44"`, `46"`, `48"`, `50"`, `52"`, `54"`, `56"`],
      ["Sleeve Length", `22.5"`, `23.5"`, `24.5"`, `25.5"`, `26.5"`, `27.5"`, `28.5"`],
    ],
  },
  "the-core-x-crewneck": {
    headers: ADULT_XS_3XL,
    rows: [
      ["Chest", `45"`, `47"`, `49"`, `51"`, `53"`, `55"`, `57"`],
      ["Sleeve Length", `22"`, `23"`, `24"`, `25"`, `26"`, `27"`, `28"`],
    ],
  },
  "unisex-retro-x-com-crewneck-pre-sale": {
    headers: ADULT_XS_3XL,
    rows: [
      ["Chest", `45"`, `47"`, `49"`, `51"`, `53"`, `55"`, `57"`],
      ["Sleeve Length", `22"`, `23"`, `24"`, `25"`, `26"`, `27"`, `28"`],
    ],
  },
  "hardcore-grok-reflective-tee": {
    headers: ADULT_XS_3XL,
    rows: [
      ["Chest", `39"`, `41"`, `43"`, `45"`, `47"`, `49"`, `51"`],
      ["Sleeve Length", `7.8"`, `8"`, `8.3"`, `8.5"`, `8.8"`, `9"`, `9.3"`],
    ],
  },
  "grok-logo-tee": {
    headers: ADULT_XS_3XL,
    rows: [
      ["Chest", `40"`, `41"`, `43.4"`, `44.9"`, `47.2"`, `48.8"`, `51.2"`],
      ["Sleeve Length", `7.8"`, `7.8"`, `8.2"`, `8.6"`, `8.6"`, `8.6"`, `9.4"`],
    ],
  },
  "grok-logo-tee-copy": {
    headers: ADULT_XS_3XL,
    rows: [
      ["Chest", `40"`, `41"`, `43.4"`, `44.9"`, `47.2"`, `48.8"`, `51.2"`],
      ["Sleeve Length", `7.8"`, `7.8"`, `8.2"`, `8.6"`, `8.6"`, `8.6"`, `9.4"`],
    ],
  },
  "grok-logo-tee-copy-1": {
    headers: ADULT_XS_3XL,
    rows: [
      ["Chest", `40"`, `41"`, `43.4"`, `44.9"`, `47.2"`, `48.8"`, `51.2"`],
      ["Sleeve Length", `7.8"`, `7.8"`, `8.2"`, `8.6"`, `8.6"`, `8.6"`, `9.4"`],
    ],
  },
  "xai-dark-ani-tee": {
    headers: ADULT_XS_3XL,
    rows: [
      ["Chest", `40"`, `41"`, `43.4"`, `44.9"`, `47.2"`, `48.8"`, `51.2"`],
      ["Sleeve Length", `7.8"`, `7.8"`, `8.2"`, `8.6"`, `8.6"`, `8.6"`, `9.4"`],
    ],
  },
  "xai-human-connection-tee": {
    headers: ADULT_XS_3XL,
    rows: [
      ["Chest", `40"`, `41"`, `43.4"`, `44.9"`, `47.2"`, `48.8"`, `51.2"`],
      ["Sleeve Length", `7.8"`, `7.8"`, `8.2"`, `8.6"`, `8.6"`, `8.6"`, `9.4"`],
    ],
  },
  "unisex-retro-x-com-short-sleeve-tee-pre-sale": {
    headers: ADULT_XS_3XL,
    rows: [
      ["Chest", `39"`, `41"`, `43"`, `45"`, `47"`, `49"`, `51"`],
      ["Sleeve Length", `7.8"`, `8"`, `8.3"`, `8.5"`, `8.8"`, `9"`, `9.3"`],
    ],
  },
  "kids-grok-to-understand-tee": {
    headers: KIDS,
    rows: [
      ["Chest", `22.8"`, `25.2"`, `27.5"`, `28.75"`, `29.9"`, `31.1"`],
      ["Sleeve Length", `4.5"`, `4.9"`, `5.3"`, `5.5"`, `5.7"`, `5.9"`],
    ],
  },
  "kids-grok-to-understand-tee-copy": {
    headers: KIDS,
    rows: [
      ["Chest", `31.5"`, `32.25"`, `33"`, `33.75"`, `34.5"`, `35.5"`],
      ["Sleeve Length", `15.25"`, `15.6"`, `16"`, `16.4"`, `16.75"`, `17.1"`],
    ],
  },
};

/** 代码内置参数表的全部商品 slug（供检索与判断"该商品有参数表"） */
export const SIZE_CHART_SLUGS: string[] = Object.keys(SIZE_CHARTS);

export function getSizeChart(slug: string): SizeChartTable | null {
  return SIZE_CHARTS[slug] ?? null;
}

/** 代码内置参数表检索：返回表头/内容命中关键词的商品 slug（官方 Pages 结果含 Size Chart） */
export function searchSizeChartSlugs(query: string): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits: string[] = [];
  for (const [slug, chart] of Object.entries(SIZE_CHARTS)) {
    const haystack = [...chart.headers, ...chart.rows.flat()].join(" ").toLowerCase();
    if (haystack.includes(q)) hits.push(slug);
  }
  return hits;
}

export function SizeChartAccordion({ chart }: { chart: SizeChartTable }) {
  return (
    <details className="group border-b border-t border-border">
      <summary className="flex h-[84px] cursor-pointer list-none items-center justify-between [&::-webkit-details-marker]:hidden">
        {/* 官方布局：标题居左，animated-plus 开关居右（展开旋转 45°） */}
        <span className="text-[12px] font-normal text-foreground">Size Chart</span>
        <span
          aria-hidden="true"
          className="relative mr-1 inline-block h-[11px] w-[11px] transition-transform duration-300 group-open:rotate-45"
        >
          <span className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-current" />
          <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-current" />
        </span>
      </summary>
      {/* 内容区官方 padding: 0 20px 20px 0 */}
      <div className="pb-5 pr-5">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[15px] font-normal text-foreground">
            <tbody>
              {/* 官方结构：1 行表头 + N 行数据（N = rows.length），绝无空行；
                  单元格 1px 发丝线（--border = #DDDDDD，与原站一致）：每行底部横线 + 非首列左边竖线 */}
              <tr className="border-b border-t border-border">
                {chart.headers.map((cell, ci) => (
                  <th
                    key={ci}
                    scope="col"
                    className={`py-4 text-[15px] font-bold ${
                      ci === 0
                        ? "border-l-0 px-3 pl-0 text-left"
                        : "border-l border-border px-3 text-center"
                    }`}
                  >
                    {cell}
                  </th>
                ))}
              </tr>
              {chart.rows.map((row, ri) => (
                <tr key={ri} className="border-b border-border">
                  {row.map((cell, ci) => (
                    <td
                      key={ci}
                      className={`py-4 align-middle tabular-nums ${
                        ci === 0
                          ? "border-l-0 px-3 pl-0 text-left font-bold"
                          : "border-l border-border px-3 text-center"
                      }`}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </details>
  );
}
