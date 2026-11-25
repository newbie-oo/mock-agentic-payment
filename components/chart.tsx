"use client";
import { baht } from "@/lib/display";
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
export function Trend({ data }: { data: { date: string; total: number }[] }) {
  return (
    <div
      role="img"
      aria-label={
        "Daily revenue: " +
        data.map((p) => p.date + " " + baht(p.total)).join(", ")
      }
      style={{ height: 205, minWidth: 0, overflow: "hidden" }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ left: -15, right: 12, top: 14 }}>
          <defs>
            <linearGradient id="income" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7973ef" stopOpacity={0.32} />
              <stop offset="100%" stopColor="#7973ef" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid
            vertical={false}
            stroke="#ececf5"
            strokeDasharray="3 4"
          />
          <XAxis
            dataKey="date"
            tickFormatter={(x) => x.slice(5)}
            axisLine={false}
            tickLine={false}
            fontSize={11}
          />
          <YAxis
            tickFormatter={(v) => baht(v)}
            axisLine={false}
            tickLine={false}
            fontSize={11}
          />
          <Tooltip formatter={(value) => baht(Number(value))} />
          <Area
            name="Revenue (THB)"
            type="monotone"
            dataKey="total"
            stroke="#6254d9"
            strokeWidth={3}
            fill="url(#income)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
