"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getIntegrityCheck, type IntegrityResult } from "@/services/fraudApi";

function minutesAgo(ts: string): string {
  try {
    const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
    if (diff < 1) return "just now";
    if (diff < 60) return `${diff}m ago`;
    return `${Math.floor(diff / 60)}h ago`;
  } catch { return "—"; }
}

export default function IntegrityPanel() {
  const [result, setResult]   = useState<IntegrityResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const busy = useRef(false);

  const runCheck = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    setError(null);
    try {
      const [res] = await Promise.all([
        getIntegrityCheck(),
        new Promise((r) => setTimeout(r, 800)),
      ]);
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check failed");
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => { runCheck(); }, [runCheck]);
  useEffect(() => {
    const id = setInterval(runCheck, 30_000);
    return () => clearInterval(id);
  }, [runCheck]);

  const verified = result?.status === "verified";

  return (
    <div className={`rounded-2xl border p-5 dark:bg-white/[0.03] ${
      result
        ? verified
          ? "border-success-200 bg-success-50/40 dark:border-success-800/30 dark:bg-success-500/5"
          : "border-error-200 bg-error-50 dark:border-error-900/30 dark:bg-error-500/10"
        : "border-gray-200 bg-white dark:border-gray-800"
    }`}>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Chain ↔ Database integrity</h3>
        <button
          onClick={runCheck}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-40 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
        >
          <svg className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {loading ? "Checking…" : "Run check"}
        </button>
      </div>

      {loading && !result && (
        <div className="space-y-2">
          <div className="h-6 w-40 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
          <div className="h-3 w-52 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
        </div>
      )}

      {error && !result && <p className="text-sm text-error-500">{error} — is the backend running?</p>}

      {result && (
        <>
          <div className="mb-4 flex items-center gap-2">
            {verified ? (
              <svg className="h-5 w-5 shrink-0 text-success-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            ) : (
              <svg className="h-5 w-5 shrink-0 text-error-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            )}
            <span className={`text-base font-bold ${verified ? "text-success-600 dark:text-success-400" : "text-error-600 dark:text-error-400"}`}>
              {verified ? "Verified — no tampering" : "Discrepancy detected"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "On-chain",   value: result.chain_total },
              { label: "In DB",      value: result.db_total },
              { label: "Matched",    value: result.matched,       good: true },
              { label: "Mismatches", value: result.mismatches,    warn: result.mismatches > 0 },
              { label: "Chain only", value: result.only_in_chain, warn: result.only_in_chain > 0 },
              { label: "DB only",    value: result.only_in_db,    warn: result.only_in_db > 0 },
            ].map(({ label, value, warn, good }) => (
              <div key={label} className="flex justify-between text-xs">
                <span className="text-gray-500 dark:text-gray-400">{label}</span>
                <span className={`font-semibold ${
                  warn ? "text-error-600 dark:text-error-400"
                  : good ? "text-success-600 dark:text-success-400"
                  : "text-gray-700 dark:text-gray-300"
                }`}>{value.toLocaleString()}</span>
              </div>
            ))}
          </div>

          <p className="mt-3 text-xs text-gray-400">Checked {minutesAgo(result.checked_at)} · re-runs every 30s</p>
        </>
      )}
    </div>
  );
}
