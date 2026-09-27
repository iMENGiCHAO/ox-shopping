
/**
 * Size Chart 手风琴组件 — 上游参考站 官方同构。
 * 数据层已迁移（2026-09-26 数据孤岛修复）：此前内置 16 个演示品的尺码表注册表，
 * 导致「后台编辑器为空时前台仍显示内置表」（后台所见≠前台所示）。数据现由
 * seed 灌入 product.sizeChart（DB 为唯一事实源，见 prisma/size-charts.ts），
 * 本文件只保留纯展示组件与类型。
 */
export interface SizeChartTable {
  headers: string[];
  rows: string[][];
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

