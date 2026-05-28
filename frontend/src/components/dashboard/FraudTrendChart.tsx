"use client";
import React, { useState } from "react";
import { ApexOptions } from "apexcharts";
import dynamic from "next/dynamic";
import type { FraudTrendEntry } from "@/services/fraudApi";

const ReactApexChart = dynamic(() => import("react-apexcharts"), { ssr: false });

type Granularity = "monthly" | "quarterly" | "yearly";

const GRANULARITIES: Granularity[] = ["monthly", "quarterly", "yearly"];
const LABELS: Record<Granularity, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
};

interface FraudTrendChartProps {
  trend: FraudTrendEntry[];
}

// Roll the monthly series (from the snapshot) up to the chosen granularity.
// Entries are "YYYY-MM"; the backend always sends monthly, so quarter/year are
// pure client-side aggregation — no extra fetch.
function rollup(entries: FraudTrendEntry[], g: Granularity) {
  if (g === "monthly") {
    return {
      categories: entries.map((d) => {
        const [year, month] = d.date.split("-");
        const dt = new Date(parseInt(year), parseInt(month) - 1, 1);
        return dt.toLocaleDateString("en-MY", { month: "short", year: "numeric" });
      }),
      fraud: entries.map((d) => d.fraud),
      legit: entries.map((d) => d.legit),
      amount: entries.map((d) => d.amount_at_risk),
    };
  }

  const map = new Map<string, { fraud: number; legit: number; amount: number }>();
  for (const d of entries) {
    const [year, month] = d.date.split("-");
    const key =
      g === "quarterly"
        ? `${year}-${Math.floor((parseInt(month, 10) - 1) / 3) + 1}`
        : year;
    const cur = map.get(key) ?? { fraud: 0, legit: 0, amount: 0 };
    cur.fraud += d.fraud;
    cur.legit += d.legit;
    cur.amount += d.amount_at_risk;
    map.set(key, cur);
  }
  const keys = [...map.keys()].sort();
  return {
    categories: keys.map((k) =>
      g === "quarterly" ? `Q${k.split("-")[1]} ${k.split("-")[0]}` : k
    ),
    fraud: keys.map((k) => map.get(k)!.fraud),
    legit: keys.map((k) => map.get(k)!.legit),
    amount: keys.map((k) => map.get(k)!.amount),
  };
}

// Compact MYR for the right axis / tooltip: 2613334 → "RM 2.6M"
const compactMYR = (n: number): string => {
  if (n >= 1e9) return `RM ${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `RM ${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `RM ${(n / 1e3).toFixed(1)}K`;
  return `RM ${Math.round(n)}`;
};

export default function FraudTrendChart({ trend }: FraudTrendChartProps) {
  const [granularity, setGranularity] = useState<Granularity>("monthly");

  const sorted = [...(Array.isArray(trend) ? trend : [])].sort((a, b) =>
    a.date.localeCompare(b.date)
  );
  const { categories, fraud: fraudSeries, amount: amountSeries } = rollup(sorted, granularity);

  const options: ApexOptions = {
    legend: { show: true, position: "top", horizontalAlign: "left", fontFamily: "Outfit, sans-serif" },
    colors: ["#F04438", "#F79009"],
    chart: { fontFamily: "Outfit, sans-serif", height: 310, type: "line", toolbar: { show: false } },
    stroke: { curve: "straight", width: [2, 2], dashArray: [0, 4] },
    markers: { size: 0, hover: { size: 6 } },
    grid: { xaxis: { lines: { show: false } }, yaxis: { lines: { show: true } } },
    dataLabels: { enabled: false },
    tooltip: {
      enabled: true,
      y: {
        formatter: (val: number, opts?: { seriesIndex: number }) =>
          opts?.seriesIndex === 1 ? compactMYR(val) : `${Math.round(val)}`,
      },
    },
    xaxis: {
      type: "category",
      categories,
      axisBorder: { show: false },
      axisTicks: { show: false },
      tooltip: { enabled: false },
    },
    yaxis: [
      {
        seriesName: "Fraud",
        forceNiceScale: true,
        decimalsInFloat: 0,
        title: { text: "Fraud transactions", style: { fontSize: "11px", color: "#6B7280" } },
        labels: { style: { fontSize: "12px", colors: ["#6B7280"] } },
      },
      {
        seriesName: "Amount at Risk",
        opposite: true,
        title: { text: "Amount at Risk", style: { fontSize: "11px", color: "#6B7280" } },
        labels: { style: { fontSize: "12px", colors: ["#6B7280"] }, formatter: (v: number) => compactMYR(v) },
      },
    ],
  };

  const series = [
    { name: "Fraud",          type: "line", data: fraudSeries },
    { name: "Amount at Risk", type: "line", data: amountSeries },
  ];

  return (
    <div className="h-full rounded-2xl border border-gray-200 bg-white px-5 pb-5 pt-5 dark:border-gray-800 dark:bg-white/[0.03] sm:px-6 sm:pt-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">Fraud Trend</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {LABELS[granularity]} fraud transactions and amount at risk
          </p>
        </div>
        <div className="inline-flex shrink-0 rounded-lg bg-gray-100 p-0.5 dark:bg-gray-800 print:hidden">
          {GRANULARITIES.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGranularity(g)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                granularity === g
                  ? "bg-white text-gray-800 shadow-sm dark:bg-white/10 dark:text-white"
                  : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white/90"
              }`}
            >
              {LABELS[g]}
            </button>
          ))}
        </div>
      </div>
      <div className="max-w-full overflow-x-auto custom-scrollbar">
        <div className="min-w-[600px] xl:min-w-full">
          {sorted.length === 0 ? (
            <div className="flex h-[200px] items-center justify-center text-gray-400 text-sm">
              No trend data available
            </div>
          ) : (
            <ReactApexChart options={options} series={series} type="line" height={310} />
          )}
        </div>
      </div>
    </div>
  );
}
