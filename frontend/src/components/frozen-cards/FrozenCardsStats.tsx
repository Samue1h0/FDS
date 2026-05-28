"use client";
import React from "react";
import { CalenderIcon, DollarLineIcon, LockIcon } from "@/icons";
import type { FrozenCardsSummary } from "@/services/fraudApi";

// Compact MYR: 2613334.52 → "RM 2.6M"
const formatMYR = (n: number): string => {
  if (n >= 1e9) return `RM ${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `RM ${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `RM ${(n / 1e3).toFixed(1)}K`;
  return `RM ${n.toFixed(0)}`;
};

interface Props {
  summary: FrozenCardsSummary | null;
}

export default function FrozenCardsStats({ summary }: Props) {
  const items = [
    {
      label: "Frozen Cards",
      value: summary ? summary.total.toLocaleString() : "—",
      icon: <LockIcon className="size-6 text-gray-800 dark:text-white/90" />,
    },
    {
      label: "Frozen This Month",
      value: summary ? summary.this_month.toLocaleString() : "—",
      icon: <CalenderIcon className="size-6 text-gray-800 dark:text-white/90" />,
    },
    {
      label: "Total at Risk",
      value: summary ? formatMYR(summary.total_at_risk) : "—",
      icon: <DollarLineIcon className="size-6 text-gray-800 dark:text-white/90" />,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 md:gap-6">
      {items.map((it) => (
        <div
          key={it.label}
          className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800">
            {it.icon}
          </div>
          <div>
            <span className="text-sm text-gray-500 dark:text-gray-400">{it.label}</span>
            <h4 className="mt-1 whitespace-nowrap font-bold text-gray-800 text-title-sm dark:text-white/90">
              {it.value}
            </h4>
          </div>
        </div>
      ))}
    </div>
  );
}
