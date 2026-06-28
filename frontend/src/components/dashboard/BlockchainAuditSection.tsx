"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import Badge from "../ui/badge/Badge";
import type { Transaction, Stats } from "@/services/fraudApi";

const BASE = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:8000";

interface BlockchainAuditSectionProps {
  transactions: Transaction[];
  stats: Stats | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function minutesAgo(timestamp: string): string {
  try {
    const diff = Math.floor((Date.now() - new Date(timestamp).getTime()) / 60000);
    if (diff < 1)  return "just now";
    if (diff < 60) return `${diff}m ago`;
    const hrs = Math.floor(diff / 60);
    if (hrs < 24)  return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  } catch { return "—"; }
}

function formatTime(timestamp: string): string {
  try {
    return new Date(timestamp).toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit" });
  } catch { return "—"; }
}

function isToday(timestamp: string): boolean {
  try {
    const d = new Date(timestamp), now = new Date();
    return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  } catch { return false; }
}

// ── Card 1: Immutability Health ───────────────────────────────────────────────

function ImmutabilityHealthCard({ transactions, stats }: { transactions: Transaction[]; stats: Stats | null }) {
  // Count of records secured on-chain. Uses the authoritative total from stats
  // (the transactions list is capped), falling back to the loaded rows.
  const count  = stats?.total ?? transactions.length;
  const active = count > 0;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Immutability Health</p>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
          active
            ? "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400"
            : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${active ? "bg-success-500 animate-pulse" : "bg-gray-400"}`} />
          {active ? "Verified" : "No data"}
        </span>
      </div>
      <p className="text-2xl font-bold text-gray-800 dark:text-white/90">
        {count.toLocaleString()}
      </p>
      <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">Records cryptographically secured on chain</p>
    </div>
  );
}

// ── Card 2: Audit Trail Today ─────────────────────────────────────────────────

function AuditTrailTodayCard({ transactions }: { transactions: Transaction[]; stats: Stats | null }) {
  const todayReviewed = transactions.filter(t => t.reviewed_at && isToday(t.reviewed_at)).length;
  const todayTotal    = transactions.filter(t => isToday(t.created_at)).length;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Audit Trail Today</p>
        <Badge size="sm" color="info">On-chain</Badge>
      </div>
      <p className="text-2xl font-bold text-gray-800 dark:text-white/90">{todayReviewed}</p>
      <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
        Reviews recorded · {todayTotal} transactions ingested
      </p>
    </div>
  );
}

// ── Card 3: Review Velocity ───────────────────────────────────────────────────

function ReviewVelocityCard({ transactions }: { transactions: Transaction[] }) {
  // Queue time: how long a case waited from entering the system (created_at) to
  // being actioned (reviewed_at). Measuring against the transaction's business
  // timestamp instead would include the purchase's historical age (months/years).
  const reviewed = transactions.filter(t => t.reviewed_by && t.reviewed_at && t.created_at);

  let avgHours = 0;
  let fast = 0;   // < 4 h
  let slow = 0;   // > 24 h

  if (reviewed.length > 0) {
    const deltas = reviewed.map(t => {
      const ms = new Date(t.reviewed_at).getTime() - new Date(t.created_at).getTime();
      return Math.max(ms / 3_600_000, 0);
    });
    avgHours = deltas.reduce((s, v) => s + v, 0) / deltas.length;
    fast     = deltas.filter(h => h < 4).length;
    slow     = deltas.filter(h => h > 24).length;
  }

  const display =
    reviewed.length === 0 ? "—"
    : avgHours < 1        ? `${Math.round(avgHours * 60)}m`
    :                       `${avgHours.toFixed(1)}h`;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Review Velocity</p>
        <Badge size="sm" color="success">SLA</Badge>
      </div>
      <p className="text-2xl font-bold text-gray-800 dark:text-white/90">{display}</p>
      <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
        Avg time to review
        {reviewed.length > 0 && ` · ${fast} fast · ${slow} slow`}
      </p>
    </div>
  );
}

// ── Card 4: Model vs Analyst Agreement ───────────────────────────────────────

function ModelAgreementCard({ transactions }: { transactions: Transaction[] }) {
  const reviewed = transactions.filter(
    t => t.reviewed_by && (t.ground_truth_label === 0 || t.ground_truth_label === 1)
  );
  const agreed = reviewed.filter(
    t =>
      (t.predicted_label === "FRAUD" && t.ground_truth_label === 1) ||
      (t.predicted_label === "LEGIT" && t.ground_truth_label === 0)
  );

  const pct = reviewed.length > 0 ? Math.round((agreed.length / reviewed.length) * 100) : null;
  const disagreed = reviewed.length - agreed.length;

  const color =
    pct === null  ? "text-gray-800 dark:text-white/90"
    : pct >= 80   ? "text-success-600 dark:text-success-400"
    : pct >= 60   ? "text-warning-600 dark:text-warning-400"
    :               "text-error-600 dark:text-error-400";

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Model vs Analyst</p>
        <Badge size="sm" color="warning">Agreement</Badge>
      </div>

      {reviewed.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">No reviewed transactions yet</p>
      ) : (
        <>
          <p className={`text-2xl font-bold ${color}`}>{pct}%</p>
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500 mb-4">
            Prediction matches analyst verdict
          </p>
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Agreed</span>
              <span className="font-medium text-gray-700 dark:text-gray-300">{agreed.length}</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-gray-100 dark:bg-gray-800">
              <div
                className="h-1.5 rounded-full bg-success-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Disagreed</span>
              <span className="font-medium text-error-600 dark:text-error-400">{disagreed}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Card 5: Recently Reviewed ─────────────────────────────────────────────────

function RecentlyReviewedCard({ transactions }: { transactions: Transaction[] }) {
  const recent = [...transactions]
    .filter(t => t.reviewed_by && t.reviewed_at)
    .sort((a, b) => new Date(b.reviewed_at).getTime() - new Date(a.reviewed_at).getTime())
    .slice(0, 5);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Recently Reviewed</p>
      </div>

      {recent.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">No reviews yet</p>
      ) : (
        <div className="space-y-3">
          {recent.map(txn => (
            <div key={txn.transaction_id} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">
                  {txn.transaction_id}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  by {txn.reviewed_by} · {formatTime(txn.reviewed_at)}
                </p>
              </div>
              <Badge size="sm" color={txn.ground_truth_label === 1 ? "error" : "success"}>
                {txn.ground_truth_label === 1 ? "Fraud" : "Legit"}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Card 6: Chain–DB Tamper Evidence ─────────────────────────────────────────

interface IntegrityResult {
  status:          "verified" | "tampered";
  chain_total:     number;
  db_total:        number;
  checked:         number;
  matched:         number;
  mismatches:      number;
  only_in_chain:   number;
  only_in_db:      number;
  mismatch_sample: { transaction_id: string; field: string; chain: unknown; db: unknown }[];
  checked_at:      string;
}

function TamperEvidenceCard() {
  const [result, setResult]   = useState<IntegrityResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const loadingRef            = useRef(false);

  const runCheck = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const [res] = await Promise.all([
        fetch(`${BASE}/api/audit/integrity-check`).then(r => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        }),
        new Promise<void>(resolve => setTimeout(resolve, 1000)),
      ]);
      setResult(res);
    } catch (e) {
      setError((e as Error).message ?? "Check failed");
    } finally {
      loadingRef.current = false;
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
          : "border-red-200 bg-red-50 dark:border-red-900/30 dark:bg-red-500/10"
        : "border-gray-200 bg-white dark:border-gray-800"
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Chain–DB Integrity</p>
        <button
          onClick={runCheck}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-40 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
        >
          <svg className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {loading ? "Checking…" : "Run Check"}
        </button>
      </div>

      {/* Status */}
      {loading && !result && (
        <div className="space-y-2 animate-pulse">
          <div className="h-6 w-32 rounded bg-gray-200 dark:bg-gray-700" />
          <div className="h-3 w-48 rounded bg-gray-100 dark:bg-gray-800" />
        </div>
      )}

      {error && !result && (
        <p className="text-sm text-red-500">{error} — is the backend running?</p>
      )}

      {result && (
        <>
          <div className="flex items-center gap-2 mb-4">
            {verified ? (
              <>
                <svg className="w-5 h-5 text-success-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <span className="text-base font-bold text-success-600 dark:text-success-400">Verified — No Tampering</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
                <span className="text-base font-bold text-red-600 dark:text-red-400">Discrepancy Detected</span>
              </>
            )}
          </div>

          {/* Stat grid */}
          <div className="grid grid-cols-2 gap-2 mb-3">
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
                  warn ? "text-red-600 dark:text-red-400"
                  : good ? "text-success-600 dark:text-success-400"
                  : "text-gray-700 dark:text-gray-300"
                }`}>{value}</span>
              </div>
            ))}
          </div>

          {/* Discrepancy explanation */}
          {!verified && (
            <div className="mt-3 space-y-1.5 border-t border-red-200 pt-3 dark:border-red-900/30">
              {result.only_in_chain > 0 && (
                <p className="text-xs text-red-500 dark:text-red-400">
                  {result.only_in_chain} record{result.only_in_chain > 1 ? "s" : ""} found on blockchain but missing from the private database — possible database deletion or reset.
                </p>
              )}
              {result.only_in_db > 0 && (
                <p className="text-xs text-red-500 dark:text-red-400">
                  {result.only_in_db} record{result.only_in_db > 1 ? "s" : ""} in the private database have no corresponding chain entry — possible chain bypass.
                </p>
              )}
              {result.mismatch_sample.length > 0 && (
                <>
                  <p className="text-xs font-medium text-red-600 dark:text-red-400 mt-2 mb-1">Field mismatches</p>
                  {result.mismatch_sample.map((m, i) => (
                    <div key={i} className="rounded-lg bg-red-100/60 dark:bg-red-500/10 px-2.5 py-1.5 text-xs">
                      <span className="font-mono text-gray-700 dark:text-gray-300 truncate block">{m.transaction_id}</span>
                      <span className="text-red-500">{m.field}: </span>
                      <span className="text-gray-500">chain={String(m.chain)} · db={String(m.db)}</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          <p className="mt-3 text-xs text-gray-400 dark:text-gray-500">
            Checked {minutesAgo(result.checked_at)}
          </p>
        </>
      )}
    </div>
  );
}

// ── Main section ──────────────────────────────────────────────────────────────

export default function BlockchainAuditSection({ transactions, stats }: BlockchainAuditSectionProps) {
  return (
    <div className="col-span-12">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Blockchain Audit</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Tamper-proof chain of custody for all fraud decisions
        </p>
      </div>

      {/* Row 1 — 3 stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 md:gap-6">
        <ImmutabilityHealthCard transactions={transactions} stats={stats} />
        <AuditTrailTodayCard transactions={transactions} stats={stats} />
        <ReviewVelocityCard transactions={transactions} />
      </div>

      {/* Row 2 — 3 detail cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 md:gap-6 mt-4">
        <ModelAgreementCard transactions={transactions} />
        <RecentlyReviewedCard transactions={transactions} />
        <TamperEvidenceCard />
      </div>
    </div>
  );
}
