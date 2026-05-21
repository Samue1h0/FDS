"use client";

import { ApexOptions } from "apexcharts";
import dynamic from "next/dynamic";
import type { MlFeatureImportance } from "@/services/fraudApi";

const ReactApexChart = dynamic(() => import("react-apexcharts"), { ssr: false });

const GROUP_COLORS: Record<string, string> = {
  Velocity:    "#8b5cf6",
  Engineered:  "#06b6d4",
  Transaction: "#3b82f6",
  Profile:     "#f59e0b",
  Other:       "#9ca3af",
};

interface MlFeatureChartProps {
  importances: MlFeatureImportance[];
}

export default function MlFeatureChart({ importances }: MlFeatureChartProps) {
  // Highest importance at the top: ApexCharts renders the first category at the
  // bottom, so reverse the (already desc-sorted) data.
  const ordered = [...importances].reverse();

  // Single-line labels only. Multi-line (array) labels don't vertically centre
  // against their bar in ApexCharts — the label area is widened (yaxis.maxWidth)
  // so the longest names fit on one line instead of wrapping/truncating.
  const categories = ordered.map((f) => f.label);
  const data       = ordered.map((f) => +(f.importance * 100).toFixed(2));
  const colors     = ordered.map((f) => GROUP_COLORS[f.group] ?? GROUP_COLORS.Other);

  const options: ApexOptions = {
    chart: { type: "bar", toolbar: { show: false }, fontFamily: "Outfit, sans-serif" },
    plotOptions: {
      bar: { horizontal: true, distributed: true, borderRadius: 4, barHeight: "80%" },
    },
    colors,
    legend: { show: false },
    dataLabels: { 
      enabled: true,
      formatter:  (val: number) => `${val}%`,
      style: { fontSize: "11px", colors: ["#fff"] },
     },
    xaxis: {
      categories,
      labels: { formatter: (val: string) => `${val}%`, style: { colors: "#9ca3af" } },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: { labels: { maxWidth: 240, style: { colors: "#6b7280", fontSize: "12px" } } },
    grid: { borderColor: "#e5e7eb", strokeDashArray: 3, xaxis: { lines: { show: true } }, yaxis: { lines: { show: false } } },
    tooltip: { y: { formatter: (val: number) => `${val}% of model weight` } },
  };

  return (
    <div className="-ml-2">
      <ReactApexChart
        options={options}
        series={[{ name: "Importance", data }]}
        type="bar"
        height={Math.max(340, categories.length * 46)}
      />
    </div>
  );
}
