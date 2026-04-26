"use client";
import React from "react";
import { ApexOptions } from "apexcharts";
import ChartTab from "../common/ChartTab";
import dynamic from "next/dynamic";
import type { FraudTrendEntry } from "@/services/fraudApi";

const ReactApexChart = dynamic(() => import("react-apexcharts"), { ssr: false });

interface FraudTrendChartProps {
  trend: FraudTrendEntry[];
}

export default function FraudTrendChart({ trend }: FraudTrendChartProps) {
  const sorted = [...trend].sort((a, b) => a.date.localeCompare(b.date));

  const categories = sorted.length
    ? sorted.map((d) => {
        const dt = new Date(d.date);
        return dt.toLocaleDateString("en-MY", { day: "2-digit", month: "short" });
      })
    : ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const fraudSeries = sorted.length ? sorted.map((d) => d.fraud) : [];
  const legitSeries = sorted.length ? sorted.map((d) => d.legit) : [];

  const options: ApexOptions = {
    legend: { show: true, position: "top", horizontalAlign: "left", fontFamily: "Outfit, sans-serif" },
    colors: ["#F04438", "#465FFF"],
    chart: { fontFamily: "Outfit, sans-serif", height: 310, type: "line", toolbar: { show: false } },
    stroke: { curve: "straight", width: [2, 2] },
    fill: { type: "gradient", gradient: { opacityFrom: 0.55, opacityTo: 0 } },
    markers: { size: 0, strokeColors: "#fff", strokeWidth: 2, hover: { size: 6 } },
    grid: { xaxis: { lines: { show: false } }, yaxis: { lines: { show: true } } },
    dataLabels: { enabled: false },
    tooltip: { enabled: true, x: { format: "dd MMM yyyy" } },
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
    { name: "Fraud", data: fraudSeries },
    { name: "Legit", data: legitSeries },
  ];

  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-5 pb-5 pt-5 dark:border-gray-800 dark:bg-white/[0.03] sm:px-6 sm:pt-6">
      <div className="flex flex-col gap-5 mb-6 sm:flex-row sm:justify-between">
        <div className="w-full">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">Fraud Trend</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Daily fraud vs legitimate transactions</p>
        </div>
        <div className="flex items-start w-full gap-3 sm:justify-end">
          <ChartTab />
        </div>
      </div>
      <div className="max-w-full overflow-x-auto custom-scrollbar">
        <div className="min-w-[1000px] xl:min-w-full">
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
