"use client";
import React, { useState } from "react";
import type { FraudTrendEntry } from "@/services/fraudApi";
import {
  Granularity,
  LABELS,
  PERIOD_NOUN,
  rollup,
  compactMYR,
} from "./trendRollup";

interface PeriodSummaryProps {
  trend: FraudTrendEntry[];
  granularity: Granularity;
}

// % change of `now` vs `prev`; null when there's no previous period.
function pctDelta(now: number, prev: number | null): number | null {
  if (prev === null) return null;
  if (prev === 0) return now > 0 ? 100 : 0;
  return ((now - prev) / prev) * 100;
}

// Red when rising (worse), green when falling (better).
function DeltaBadge({ pct, noun }: { pct: number | null; noun: string }) {
  if (pct === null) {
    return <span className="text-xs text-gray-400">no prior {noun}</span>;
  }
  const up = pct > 0;
  const down = pct < 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-medium ${
        up
          ? "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400"
          : down
          ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
          : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
      }`}
    >
      {up ? "▲" : down ? "▼" : "—"} {Math.abs(pct).toFixed(0)}%
      <span className="font-normal opacity-70">vs last {noun}</span>
    </span>
  );
}

// Summary panel that follows the granularity selected in the Fraud Trend chart,
// and lets the user pick a specific period within that granularity.
export default function PeriodSummary({ trend, granularity }: PeriodSummaryProps) {
  const sorted = [...(Array.isArray(trend) ? trend : [])].sort((a, b) =>
    a.date.localeCompare(b.date)
  );
  const { categories, fraud, legit, amount } = rollup(sorted, granularity);
  const n = categories.length;
  const noun = PERIOD_NOUN[granularity];

  // Selected period — defaults to the latest. The parent remounts this panel
  // (key={granularity}) when the granularity changes, so the default re-applies.
  const [sel, setSel] = useState(n - 1);
  const i = n === 0 ? -1 : Math.min(Math.max(sel, 0), n - 1);

  if (n === 0 || i < 0) {
    return (
      <div className="flex h-full flex-col rounded-2xl border border-gray-200 bg-white px-5 pb-5 pt-5 dark:border-gray-800 dark:bg-white/[0.03] sm:px-6 sm:pt-6">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">Period Summary</h3>
        <div className="flex flex-1 items-center justify-center text-sm text-gray-400">
          No trend data available
        </div>
      </div>
    );
  }

  const prev = i > 0 ? i - 1 : null;
  const fraudNow = fraud[i];
  const amtNow = amount[i];
  const txnsNow = fraud[i] + legit[i];
  const rateNow = txnsNow > 0 ? fraud[i] / txnsNow : null;

  const totalFraud = fraud.reduce((a, b) => a + b, 0);
  const totalAmount = amount.reduce((a, b) => a + b, 0);

  return (
    <div className="flex h-full flex-col rounded-2xl border border-gray-200 bg-white px-5 pb-5 pt-5 dark:border-gray-800 dark:bg-white/[0.03] sm:px-6 sm:pt-6">
      {/* Header + period picker */}
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">Period Summary</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{LABELS[granularity]} view</p>
        </div>
        <select
          value={i}
          onChange={(e) => setSel(Number(e.target.value))}
          className="shrink-0 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 print:hidden"
        >
          {[...categories.keys()].reverse().map((idx) => (
            <option key={idx} value={idx}>
              {categories[idx]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-1 flex-col justify-between gap-4">
        {/* Fraud cases (selected period) + Δ */}
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">Fraud cases</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-gray-800 dark:text-white/90">
              {fraudNow.toLocaleString()}
            </span>
          </div>
          <div className="mt-1.5">
            <DeltaBadge pct={pctDelta(fraudNow, prev === null ? null : fraud[prev])} noun={noun} />
          </div>
        </div>

        {/* Amount at risk (selected period) + Δ */}
        <div className="border-t border-gray-100 pt-4 dark:border-gray-800">
          <p className="text-sm text-gray-500 dark:text-gray-400">Amount at risk</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-semibold text-gray-800 dark:text-white/90">
              {compactMYR(amtNow)}
            </span>
          </div>
          <div className="mt-1.5">
            <DeltaBadge pct={pctDelta(amtNow, prev === null ? null : amount[prev])} noun={noun} />
          </div>
        </div>

        {/* Fraud rate (selected period) */}
        <div className="border-t border-gray-100 pt-4 dark:border-gray-800">
          <p className="text-sm text-gray-500 dark:text-gray-400">Fraud rate</p>
          <p className="mt-1 text-xl font-semibold text-gray-800 dark:text-white/90">
            {rateNow === null ? "—" : `${(rateNow * 100).toFixed(1)}%`}
          </p>
        </div>

        {/* Totals across all periods in view */}
        <div className="grid grid-cols-2 gap-4 rounded-xl bg-gray-50 px-4 py-3 dark:bg-white/[0.03]">
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Total cases ({n} {noun}{n === 1 ? "" : "s"})</p>
            <p className="mt-0.5 text-base font-semibold text-gray-800 dark:text-white/90">
              {totalFraud.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">Total at risk</p>
            <p className="mt-0.5 text-base font-semibold text-gray-800 dark:text-white/90">
              {compactMYR(totalAmount)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
