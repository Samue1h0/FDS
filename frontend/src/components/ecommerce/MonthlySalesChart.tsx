"use client";
import { ApexOptions } from "apexcharts";
import dynamic from "next/dynamic";
import { MoreDotIcon } from "@/icons";
import { DropdownItem } from "../ui/dropdown/DropdownItem";
import { useState } from "react";
import { Dropdown } from "../ui/dropdown/Dropdown";
import type { ScoreDistributionEntry } from "@/services/fraudApi";

const ReactApexChart = dynamic(() => import("react-apexcharts"), {
  ssr: false,
});

interface MonthlySalesChartProps {
  scoreDist: ScoreDistributionEntry[];
}

export default function MonthlySalesChart({ scoreDist }: MonthlySalesChartProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Map API buckets to chart-friendly labels
  const bucketLabelMap: Record<string, string> = {
    "0.0-0.2": "Very Low",
    "0.2-0.4": "Low",
    "0.4-0.6": "Medium",
    "0.6-0.8": "High",
    "0.8-1.0": "Very High",
  };

  // Use API data or fall back to empty
  const categories = scoreDist.length
    ? scoreDist.map((d) => bucketLabelMap[d.range] ?? d.range)
    : ["Very Low", "Low", "Medium", "High", "Very High"];

  const data = scoreDist.length ? scoreDist.map((d) => d.count) : [0, 0, 0, 0, 0];

  const options: ApexOptions = {
    colors: ["#465fff"],
    chart: {
      fontFamily: "Outfit, sans-serif",
      type: "bar",
      height: 253,
      toolbar: { show: false },
    },
    plotOptions: {
      bar: {
        horizontal: false,
        columnWidth: "39%",
        borderRadius: 5,
        borderRadiusApplication: "end",
      },
    },
    dataLabels: { enabled: false },
    stroke: {
      show: true,
      width: 4,
      colors: ["transparent"],
    },
    xaxis: {
      categories,
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    legend: {
      show: true,
      position: "top",
      horizontalAlign: "left",
      fontFamily: "Outfit",
    },
    yaxis: { title: { text: undefined } },
    grid: { yaxis: { lines: { show: true } } },
    fill: { opacity: 1 },
    tooltip: {
      x: { show: false },
      y: { formatter: (val: number) => `${val} transactions` },
    },
  };

  const series = [{ name: "Transactions", data }];

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white px-5 pt-5 dark:border-gray-800 dark:bg-white/[0.03] sm:px-6 sm:pt-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            Risk Distribution
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            By fraud score bucket
          </p>
        </div>

        <div className="relative inline-block">
          <button onClick={() => setIsOpen((o) => !o)} className="dropdown-toggle">
            <MoreDotIcon className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-300" />
          </button>
          <Dropdown isOpen={isOpen} onClose={() => setIsOpen(false)} className="w-40 p-2">
            <DropdownItem
              onItemClick={() => setIsOpen(false)}
              className="flex w-full font-normal text-left text-gray-500 rounded-lg hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-300"
            >
              View More
            </DropdownItem>
          </Dropdown>
        </div>
      </div>

      <div className="max-w-full overflow-x-auto custom-scrollbar">
        <div className="-ml-5 min-w-[650px] xl:min-w-full pl-2">
          <ReactApexChart
            options={options}
            series={series}
            type="bar"
            height={253.5}
          />
        </div>
      </div>
    </div>
  );
}
