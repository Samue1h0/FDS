"use client";
import Link from "next/link";
import Badge from "../ui/badge/Badge";
import type { Transaction, Stats } from "@/services/fraudApi";

interface BlockchainAuditSectionProps {
  transactions: Transaction[];
  stats: Stats | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function minutesAgo(timestamp: string): string {
  try {
    const diff = Math.floor((Date.now() - new Date(timestamp).getTime()) / 60000);
    if (diff < 1) return "just now";
    if (diff < 60) return `${diff}m ago`;
    const hrs = Math.floor(diff / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  } catch {
    return "—";
  }
}

function formatTime(timestamp: string): string {
  try {
    return new Date(timestamp).toLocaleTimeString("en-MY", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function isToday(timestamp: string): boolean {
  try {
    const d = new Date(timestamp);
    const now = new Date();
    return (
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear()
    );
  } catch {
    return false;
  }
}

// ── Sub-cards ─────────────────────────────────────────────────────────────────

function ImmutabilityHealthCard({ transactions }: { transactions: Transaction[] }) {
  const sorted = [...transactions].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  const latest = sorted[0];
  const isHealthy = latest
    ? Date.now() - new Date(latest.created_at).getTime() < 60 * 60 * 1000
    : false;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Immutability Health</p>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
            latest
              ? "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400"
              : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${latest ? "bg-success-500 animate-pulse" : "bg-gray-400"}`}
          />
          {latest ? "Active" : "No data"}
        </span>
      </div>
      <p className="text-2xl font-bold text-gray-800 dark:text-white/90">
        {latest ? minutesAgo(latest.created_at) : "—"}
      </p>
      <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">Last record written to chain</p>
    </div>
  );
}

function AuditTrailTodayCard({ transactions, stats }: { transactions: Transaction[]; stats: Stats | null }) {
  const todayReviewed = transactions.filter(
    (t) => t.reviewed_at && isToday(t.reviewed_at)
  ).length;

  const todayTotal = transactions.filter((t) => isToday(t.created_at)).length;

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

function HighRiskAlertsCard({ transactions }: { transactions: Transaction[] }) {
  const critical = transactions.filter(
    (t) => t.fraud_score >= 0.9 && t.predicted_label === "FRAUD" && !t.reviewed_by
  );

  return (
    <div className={`rounded-2xl border p-5 ${
      critical.length > 0
        ? "border-red-200 bg-red-50 dark:border-red-900/30 dark:bg-red-500/10"
        : "border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
    }`}>
      <div className="flex items-center justify-between mb-3">
        <p className={`text-sm font-medium ${
          critical.length > 0
            ? "text-red-600 dark:text-red-400"
            : "text-gray-500 dark:text-gray-400"
        }`}>
          High Risk Alerts
        </p>
        {critical.length > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700 dark:bg-red-500/20 dark:text-red-400">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            Urgent
          </span>
        )}
      </div>
      <p className={`text-2xl font-bold ${
        critical.length > 0
          ? "text-red-700 dark:text-red-400"
          : "text-gray-800 dark:text-white/90"
      }`}>
        {critical.length}
      </p>
      <p className={`mt-1 text-xs ${
        critical.length > 0 ? "text-red-500" : "text-gray-400 dark:text-gray-500"
      }`}>
        {critical.length > 0
          ? "Score ≥ 0.9, unreviewed — needs attention"
          : "No critical unreviewed cases"}
      </p>
    </div>
  );
}

function TopFlaggedMerchantsCard({ transactions }: { transactions: Transaction[] }) {
  const fraudTxns = transactions.filter((t) => t.predicted_label === "FRAUD");

  const merchantCounts = fraudTxns.reduce<Record<string, number>>((acc, t) => {
    acc[t.merchant_name] = (acc[t.merchant_name] ?? 0) + 1;
    return acc;
  }, {});

  const top3 = Object.entries(merchantCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const maxCount = top3[0]?.[1] ?? 1;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Top Flagged Merchants</p>
        <Badge size="sm" color="warning">Fraud flags</Badge>
      </div>

      {top3.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">No fraud data available</p>
      ) : (
        <div className="space-y-3">
          {top3.map(([merchant, count]) => (
            <div key={merchant}>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate max-w-[70%]">
                  {merchant}
                </p>
                <span className="text-xs text-gray-500 dark:text-gray-400">{count}</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-gray-100 dark:bg-gray-800">
                <div
                  className="h-1.5 rounded-full bg-brand-500"
                  style={{ width: `${(count / maxCount) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RecentlyReviewedCard({ transactions }: { transactions: Transaction[] }) {
  const recent = [...transactions]
    .filter((t) => t.reviewed_by && t.reviewed_at)
    .sort((a, b) => new Date(b.reviewed_at).getTime() - new Date(a.reviewed_at).getTime())
    .slice(0, 5);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Recently Reviewed</p>
        <Link
          href="/transactions?reviewed=true"
          className="text-xs text-brand-500 hover:underline dark:text-brand-400"
        >
          See all
        </Link>
      </div>

      {recent.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">No reviews yet</p>
      ) : (
        <div className="space-y-3">
          {recent.map((txn) => (
            <div key={txn.transaction_id} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">
                  {txn.transaction_id}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  by {txn.reviewed_by} · {formatTime(txn.reviewed_at)}
                </p>
              </div>
              <Badge
                size="sm"
                color={txn.ground_truth_label === 1 ? "error" : "success"}
              >
                {txn.ground_truth_label === 1 ? "Fraud" : "Legit"}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main section ──────────────────────────────────────────────────────────────

export default function BlockchainAuditSection({
  transactions,
  stats,
}: BlockchainAuditSectionProps) {
  return (
    <div className="col-span-12">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          Blockchain Audit
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Tamper-proof chain of custody for all fraud decisions
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 md:gap-6">
        {/* Row 1: 3 stat cards */}
        <ImmutabilityHealthCard transactions={transactions} />
        <AuditTrailTodayCard transactions={transactions} stats={stats} />
        <HighRiskAlertsCard transactions={transactions} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6 mt-4">
        {/* Row 2: 2 detail cards */}
        <TopFlaggedMerchantsCard transactions={transactions} />
        <RecentlyReviewedCard transactions={transactions} />
      </div>
    </div>
  );
}
