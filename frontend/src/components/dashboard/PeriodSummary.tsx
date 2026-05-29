"use client";
import React from "react";
import type { FraudTrendEntry } from "@/services/fraudApi";
import {
  Granularity,
  LABELS,
  PERIOD_NOUN,
  rollup,
  summarize,
  compactMYR,
} from "./trendRollup";

interface PeriodSummaryProps {
  trend: FraudTrendEntry[];
  granularity: Granularity;
}

// Summary stats that follow the granularity selected in the Fraud Trend chart.
// All values are derived from the same rolled-up buckets the chart draws.
export default function PeriodSummary({ trend, granularity }: PeriodSummaryProps) {
  const sorted = [...(Array.isArray(trend) ? trend : [])].sort((a, b) =>
    a.date.localeCompare(b.date)
  );
  const rolled = rollup(sorted, granularity);
  const s = summarize(rolled);
  const noun = PERIOD_NOUN[granularity];

  const hasData = s.periods > 0;
  const up = (s.deltaPct ?? 0) > 0;
  const down = (s.deltaPct ?? 0) < 0;

  return (
    <div className="flex h-full flex-col rounded-2xl border border-gray-200 bg-white px-5 pb-5 pt-5 dark:border-gray-800 dark:bg-white/[0.03] sm:px-6 sm:pt-6">
      <div className="mb-5">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          {LABELS[granularity]} Summary
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {hasData
            ? `Across ${s.periods} ${noun}${s.periods === 1 ? "" : "s"}`
            : "No trend data"}
        </p>
      </div>

      {!hasData ? (
        <div className="flex flex-1 items-center justify-center text-sm text-gray-400">
          No trend data available
        </div>
      ) : (
        <div className="flex flex-1 flex-col justify-between gap-5">
          {/* Headline — total fraud + delta vs previous period */}
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Fraud cases</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-gray-800 dark:text-white/90">
                {s.totalFraud.toLocaleString()}
              </span>
              {s.deltaPct !== null && (
                <span
                  className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-medium ${
                    up
                      ? "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400"
                      : down
                      ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
                      : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                  }`}
                >
                  {up ? "▲" : down ? "▼" : "—"} {Math.abs(s.deltaPct).toFixed(0)}%
                  <span className="font-normal opacity-70">vs last {noun}</span>
                </span>
              )}
            </div>
          </div>

          {/* Amount at risk (in view) */}
          <div className="border-t border-gray-100 pt-4 dark:border-gray-800">
            <p className="text-sm text-gray-500 dark:text-gray-400">Amount at risk</p>
            <p className="mt-1 text-2xl font-semibold text-gray-800 dark:text-white/90">
              {compactMYR(s.totalAmount)}
            </p>
          </div>

          {/* Fraud rate + peak period */}
          <div className="grid grid-cols-2 gap-4 border-t border-gray-100 pt-4 dark:border-gray-800">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Fraud rate</p>
              <p className="mt-1 text-xl font-semibold text-gray-800 dark:text-white/90">
                {s.fraudRate === null ? "—" : `${(s.fraudRate * 100).toFixed(1)}%`}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Peak {noun}</p>
              <p className="mt-1 text-sm font-semibold text-gray-800 dark:text-white/90">
                {s.peakLabel ?? "—"}
              </p>
              {s.peakLabel && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {s.peakValue.toLocaleString()} cases
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
