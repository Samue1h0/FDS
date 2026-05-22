"use client";

import { useState } from "react";
import { getTransactionHistory, type HistoryRecord } from "@/services/fraudApi";

export default function TxHistoryInspector() {
  const [txId, setTxId]       = useState("");
  const [records, setRecords] = useState<HistoryRecord[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const lookup = async () => {
    const id = txId.trim();
    if (!id) return;
    setLoading(true);
    setError(null);
    setRecords(null);
    try {
      setRecords(await getTransactionHistory(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lookup failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">On-chain record history</h2>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
          Every change to a record is appended, never overwritten. Look up a transaction to see its
          full immutable amendment trail straight from the ledger.
        </p>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex gap-2">
          <input
            value={txId}
            onChange={(e) => setTxId(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && lookup()}
            placeholder="Transaction ID  e.g. TXN0042"
            className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
          />
          <button
            onClick={lookup}
            disabled={loading || !txId.trim()}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Loading…" : "Trace"}
          </button>
        </div>

        {error && <p className="mt-4 text-sm text-error-500">{error}</p>}

        {records && records.length === 0 && (
          <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">No on-chain history for that ID.</p>
        )}

        {records && records.length > 0 && (
          <ol className="mt-5 space-y-0">
            {records.map((h, i) => (
              <li key={`${h.tx_id}-${i}`} className="relative flex gap-4 pb-6 last:pb-0">
                {/* timeline rail */}
                <div className="flex flex-col items-center">
                  <span className={`mt-1 h-3 w-3 shrink-0 rounded-full ${i === 0 ? "bg-brand-500" : "bg-gray-300 dark:bg-gray-600"}`} />
                  {i < records.length - 1 && <span className="w-px flex-1 bg-gray-200 dark:bg-gray-700" />}
                </div>
                <div className="flex-1 rounded-xl border border-gray-200 p-3 dark:border-gray-800">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                      {i === 0 ? "Latest" : `Version ${records.length - i}`} · {h.timestamp}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      h.record.predicted_label === "FRAUD"
                        ? "bg-error-50 text-error-600 dark:bg-error-500/15 dark:text-error-400"
                        : "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-400"
                    }`}>
                      {h.record.predicted_label}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400 sm:grid-cols-3">
                    <span>Score: <span className="font-medium text-gray-700 dark:text-gray-300">{(h.record.fraud_score * 100).toFixed(1)}%</span></span>
                    <span>Ground truth: <span className="font-medium text-gray-700 dark:text-gray-300">{h.record.ground_truth_label ?? "—"}</span></span>
                    <span>Reviewed by: <span className="font-medium text-gray-700 dark:text-gray-300">{h.record.reviewed_by || "—"}</span></span>
                  </div>
                  <p className="mt-2 truncate font-mono text-[11px] text-gray-400">chain tx: {h.tx_id}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
