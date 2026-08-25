"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatMoney } from "@/lib/utils";

/** sales trend data points for the last N days */
export interface SalesTrendPoint {
  date: string;
  orders: number;
  revenue: number;
}

export interface SalesTrendChartProps {
  data: SalesTrendPoint[];
  className?: string;
}

/** Sales trend chart: area chart (revenue + order count, dual metric) */
export function SalesTrendChart({ data, className }: SalesTrendChartProps) {
  return (
    <div className={className} style={{ width: "100%", height: 300 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="ordersFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 12, fill: "#64748b" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: string) => v.slice(5)}
          />
          <YAxis
            yAxisId="revenue"
            tick={{ fontSize: 12, fill: "#64748b" }}
            tickLine={false}
            axisLine={false}
            width={64}
            tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
          />
          <YAxis yAxisId="orders" orientation="right" hide />
          <Tooltip
            formatter={(value, name) => {
              if (name === "Revenue") return [formatMoney(Number(value)), name];
              return [value, name];
            }}
            labelFormatter={(label) => `Date: ${String(label)}`}
            contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13 }}
          />
          <Area
            yAxisId="revenue"
            type="monotone"
            dataKey="revenue"
            name="Revenue"
            stroke="#3b82f6"
            strokeWidth={2}
            fill="url(#revenueFill)"
          />
          <Area
            yAxisId="orders"
            type="monotone"
            dataKey="orders"
            name="Orders"
            stroke="#10b981"
            strokeWidth={2}
            fill="url(#ordersFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
