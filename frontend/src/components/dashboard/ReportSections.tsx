"use client";

import { useEffect, useState } from "react";
import { getTriggerStats, type Transaction } from "@/services/fraudApi";

// Print-only report extras for the dashboard "Download PDF report" feature.
// Rendered with `hidden print:block` so they appear only on the printed PDF,
// never on screen. The report header identifies the document; the triggers and
// top-risk sections round out the summary spec (Export Phase 3).

const TOP_RISK_LIMIT = 12;
const TOP_TRIGGERS_LIMIT = 8;

/** Banner at the very top of the printout: title, timestamp, signed-in user. */
export function ReportHeader({ username }: { username?: string }) {
  const [now] = useState(() => new Date());
  return (
    <div className="hidden print:block break-avoid">
      <div className="flex items-start justify-between border-b-2 border-gray-800 pb-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Fraud Detection — Summary Report</h1>
          <p className="mt-0.5 text-xs text-gray-600">
            Generated {now.toLocaleString()}
            {username ? ` · by ${username}` : ""}
          </p>
        </div>
        <p className="text-xs text-gray-500">Confidential</p>
      </div>
    </div>
  );
}

/** Top rule triggers, fetched from /api/triggers/stats (print-only). */
export function TopTriggersSection() {
  const [counts, setCounts] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    let active = true;
    getTriggerStats()
      .then((d) => { if (active) setCounts(d.rule_counts); })
      .catch(() => { if (active) setCounts({}); });
    return () => { active = false; };
  }, []);

  const ranked = Object.entries(counts ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_TRIGGERS_LIMIT);
  const max = ranked.length ? ranked[0][1] : 0;

  return (
    <div className="hidden print:block break-avoid rounded-2xl border border-gray-200 p-5">
      <h2 className="text-base font-semibold text-gray-800">Top rule triggers</h2>
      <p className="mb-4 text-xs text-gray-500">
        How often each detection rule has fired across all scored transactions.
      </p>
      {ranked.length === 0 ? (
        <p className="text-sm text-gray-500">No rule triggers recorded.</p>
      ) : (
        <div className="space-y-2.5">
          {ranked.map(([reason, count]) => (
            <div key={reason} className="flex items-center gap-3">
              <span className="w-1/2 truncate text-sm text-gray-700">{reason}</span>
              <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-gray-100">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-brand-500"
                  style={{ width: `${max ? (count / max) * 100 : 0}%` }}
                />
              </div>
              <span className="w-10 text-right text-sm font-semibold text-gray-800">
                {count.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Highest-fraud-score transactions, derived from the data already on the page. */
export function TopRiskSection({ transactions }: { transactions: Transaction[] }) {
  const top = [...transactions]
    .sort((a, b) => b.fraud_score - a.fraud_score)
    .slice(0, TOP_RISK_LIMIT);

  return (
    <div className="hidden print:block break-avoid rounded-2xl border border-gray-200 p-5">
      <h2 className="text-base font-semibold text-gray-800">Top-risk transactions</h2>
      <p className="mb-4 text-xs text-gray-500">
        The {top.length} highest fraud scores currently in the system.
      </p>
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-gray-200 text-gray-500">
            <th className="py-1.5 pr-2 font-medium">Transaction</th>
            <th className="py-1.5 pr-2 font-medium">Merchant</th>
            <th className="py-1.5 pr-2 text-right font-medium">Amount (MYR)</th>
            <th className="py-1.5 pr-2 text-right font-medium">Score</th>
            <th className="py-1.5 font-medium">Decision</th>
          </tr>
        </thead>
        <tbody>
          {top.map((t) => (
            <tr key={t.transaction_id} className="border-b border-gray-100">
              <td className="py-1.5 pr-2 font-mono text-gray-700">{t.transaction_id}</td>
              <td className="py-1.5 pr-2 text-gray-700">{t.merchant_name}</td>
              <td className="py-1.5 pr-2 text-right text-gray-700">
                {t.amount_myr.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </td>
              <td className="py-1.5 pr-2 text-right font-semibold text-gray-800">
                {(t.fraud_score * 100).toFixed(1)}%
              </td>
              <td className="py-1.5">
                <span className={t.predicted_label === "FRAUD" ? "font-semibold text-error-600" : "text-gray-600"}>
                  {t.predicted_label}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
