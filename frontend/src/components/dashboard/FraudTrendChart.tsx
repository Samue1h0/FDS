"use client";
import React, { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { ApexOptions } from "apexcharts";
import dynamic from "next/dynamic";
import type { FraudTrendEntry } from "@/services/fraudApi";

const ReactApexChart = dynamic(() => import("react-apexcharts"), { ssr: false });

interface FraudTrendChartProps {
  trend: FraudTrendEntry[];
}

// Roll monthly entries up into quarters (used for the print/PDF report, where
// the full monthly axis is too dense to fit the page).
function toQuarterly(entries: FraudTrendEntry[]) {
  const map = new Map<string, { fraud: number; legit: number }>();
  for (const d of entries) {
    const [year, month] = d.date.split("-");
    const q = Math.floor((parseInt(month, 10) - 1) / 3) + 1;
    const key = `${year}-${q}`;
    const cur = map.get(key) ?? { fraud: 0, legit: 0 };
    cur.fraud += d.fraud;
    cur.legit += d.legit;
    map.set(key, cur);
  }
  const keys = [...map.keys()].sort();
  return {
    categories: keys.map((k) => { const [y, q] = k.split("-"); return `Q${q} ${y}`; }),
    fraud: keys.map((k) => map.get(k)!.fraud),
    legit: keys.map((k) => map.get(k)!.legit),
  };
}

export default function FraudTrendChart({ trend }: FraudTrendChartProps) {
  // Switch to quarterly while printing; flushSync forces the chart to re-render
  // with the new data synchronously, before the browser captures the page.
  const [isPrinting, setIsPrinting] = useState(false);
  useEffect(() => {
    const before = () => flushSync(() => setIsPrinting(true));
    const after  = () => flushSync(() => setIsPrinting(false));
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);

  const sorted = [...(Array.isArray(trend) ? trend : [])].sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  const quarterly = isPrinting ? toQuarterly(sorted) : null;

  const categories = quarterly
    ? quarterly.categories
    : sorted.length
    ? sorted.map((d) => {
        const [year, month] = d.date.split("-");
        const dt = new Date(parseInt(year), parseInt(month) - 1, 1);
        return dt.toLocaleDateString("en-MY", { month: "short", year: "numeric" });
      })
    : ["Jan 2024", "Feb 2024", "Mar 2024"];

  const fraudSeries = quarterly ? quarterly.fraud : sorted.map((d) => d.fraud);
  const legitSeries = quarterly ? quarterly.legit : sorted.map((d) => d.legit);

  const options: ApexOptions = {
    legend: { show: true, position: "top", horizontalAlign: "left", fontFamily: "Outfit, sans-serif" },
    colors: ["#F04438", "#465FFF"],
    chart: { fontFamily: "Outfit, sans-serif", height: 310, type: "line", toolbar: { show: false } },
    stroke: { curve: "straight", width: [2, 2] },
    fill: { type: "gradient", gradient: { opacityFrom: 0.55, opacityTo: 0 } },
    markers: { size: 0, hover: { size: 6 } },
    grid: { xaxis: { lines: { show: false } }, yaxis: { lines: { show: true } } },
    dataLabels: { enabled: false },
    tooltip: { enabled: true },
    xaxis: {
      type: "category",
      categories,
      axisBorder: { show: false },
      axisTicks: { show: false },
      tooltip: { enabled: false },
    },
    yaxis: {
      labels: { style: { fontSize: "12px", colors: ["#6B7280"] } },
      title: { text: "", style: { fontSize: "0px" } },
    },
  };

  const series = [
    { name: "Fraud",      data: fraudSeries },
    { name: "Legitimate", data: legitSeries },
  ];

  return (
    <div className="h-full rounded-2xl border border-gray-200 bg-white px-5 pb-5 pt-5 dark:border-gray-800 dark:bg-white/[0.03] sm:px-6 sm:pt-6">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">Fraud Trend</h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {isPrinting ? "Quarterly" : "Monthly"} fraud vs legitimate transactions
        </p>
      </div>
      <div className="max-w-full overflow-x-auto custom-scrollbar">
        <div className="min-w-[600px] xl:min-w-full">
          {sorted.length === 0 ? (
            <div className="flex h-[200px] items-center justify-center text-gray-400 text-sm">
              No trend data available
            </div>
          ) : (
            <ReactApexChart options={options} series={series} type="area" height={200} />
          )}
        </div>
      </div>
    </div>
  );
}
