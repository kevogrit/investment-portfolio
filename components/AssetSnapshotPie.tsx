"use client";

import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip
} from "recharts";

const COLORS = ["#ca8a04", "#059669", "#2563eb"];

function fmtAud(n: number) {
  if (!Number.isFinite(n)) return "$0.00";
  const core = Math.abs(n).toLocaleString("en-AU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return "$" + core;
}

type Props = {
  metals: number;
  other: number;
  reNet: number;
};

export default function AssetSnapshotPie({ metals, other, reNet }: Props) {
  const raw = [
    { name: "Precious metals", value: Math.max(0, metals) },
    { name: "Other assets", value: Math.max(0, other) },
    { name: "Real estate (net)", value: Math.max(0, reNet) }
  ];
  const data = raw.filter((d) => d.value > 0);
  const total = raw.reduce((s, d) => s + d.value, 0);

  if (total <= 0) {
    return (
      <div className="snapshot-chart-empty muted">
        Add holdings to see how your net portfolio splits across asset classes.
      </div>
    );
  }

  return (
    <div className="snapshot-chart-inner">
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={56}
            outerRadius={96}
            paddingAngle={2}
            label={false}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="#fff" strokeWidth={1} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number) => [fmtAud(value), "Value"]}
            contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb" }}
          />
          <Legend verticalAlign="bottom" height={40} iconType="circle" />
        </PieChart>
      </ResponsiveContainer>
      <p className="snapshot-chart-caption muted">
        Net portfolio mix (precious metals + other + real estate equity)
      </p>
    </div>
  );
}
