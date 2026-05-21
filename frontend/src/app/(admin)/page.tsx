"use client";

import React from "react";
import { FraudMetrics }       from "@/components/dashboard/FraudMetrics";
import ReviewProgressCard      from "@/components/dashboard/ReviewProgressCard";
import RiskDistributionChart   from "@/components/dashboard/RiskDistributionChart";
import FraudTrendChart         from "@/components/dashboard/FraudTrendChart";
import RecentTransactions      from "@/components/dashboard/RecentTransactions";
import BlockchainAuditSection  from "@/components/dashboard/BlockchainAuditSection";
import DashboardStatusBar      from "@/components/dashboard/DashboardStatusBar";
import FraudAlertFeed          from "@/components/dashboard/FraudAlertFeed";
import { useDashboardData }    from "@/hooks/useDashboardData";

// ── Skeletons ─────────────────────────────────────────────────────────────────

function MetricsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-4 md:gap-6">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6 mt-5">
          <div className="flex items-end justify-between gap-6">
            <div className="w-17 h-17 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-24 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" />
              <div className="h-7 w-16 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ChartSkeleton({ height = "h-[260px]" }: { height?: string }) {
  return (
    <div className={`rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] p-5 sm:p-6 ${height}`}>
      <div className="h-5 w-32 rounded bg-gray-200 dark:bg-gray-700 animate-pulse mb-2" />
      <div className="h-3 w-48 rounded bg-gray-100 dark:bg-gray-800 animate-pulse mb-6" />
      <div className="flex items-end gap-2 h-[160px]">
        {[60, 80, 45, 90, 70, 55, 85, 40, 75, 65, 95, 50].map((h, i) => (
          <div key={i} className="flex-1 rounded-t bg-gray-100 dark:bg-gray-800 animate-pulse" style={{ height: `${h}%` }} />
        ))}
      </div>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-4 pb-3 pt-4 dark:border-gray-800 dark:bg-white/[0.03] sm:px-6">
      <div className="flex justify-between mb-4">
        <div className="h-5 w-40 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" />
        <div className="h-8 w-16 rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse" />
      </div>
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center gap-4 py-2">
            <div className="flex-1 space-y-1">
              <div className="h-3 w-24 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" />
              <div className="h-3 w-32 rounded bg-gray-100 dark:bg-gray-800 animate-pulse" />
            </div>
            <div className="h-3 w-20 rounded bg-gray-200 dark:bg-gray-700 animate-pulse" />
            <div className="h-5 w-12 rounded-full bg-gray-100 dark:bg-gray-800 animate-pulse" />
            <div className="h-5 w-16 rounded-full bg-gray-100 dark:bg-gray-800 animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}

function RadialSkeleton() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-100 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="px-5 pt-5 bg-white shadow-default rounded-2xl pb-11 dark:bg-gray-900 sm:px-6 sm:pt-6">
        <div className="h-5 w-36 rounded bg-gray-200 dark:bg-gray-700 animate-pulse mb-2" />
        <div className="h-3 w-52 rounded bg-gray-100 dark:bg-gray-800 animate-pulse mb-6" />
        <div className="mx-auto w-48 h-48 rounded-full bg-gray-100 dark:bg-gray-800 animate-pulse" />
        <div className="mx-auto mt-6 h-4 w-64 rounded bg-gray-100 dark:bg-gray-800 animate-pulse" />
      </div>
      <div className="flex justify-center gap-8 py-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="space-y-1 text-center">
            <div className="h-3 w-12 rounded bg-gray-200 dark:bg-gray-700 animate-pulse mx-auto" />
            <div className="h-5 w-8 rounded bg-gray-200 dark:bg-gray-700 animate-pulse mx-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}

function AlertSkeleton() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] p-5 sm:p-6">
      <div className="h-5 w-28 rounded bg-gray-200 dark:bg-gray-700 animate-pulse mb-2" />
      <div className="h-3 w-40 rounded bg-gray-100 dark:bg-gray-800 animate-pulse mb-5" />
      <div className="space-y-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-16 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
        ))}
      </div>
    </div>
  );
}

function AuditSkeleton() {
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 md:gap-6">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="h-3 w-28 rounded bg-gray-200 dark:bg-gray-700 animate-pulse mb-3" />
            <div className="h-8 w-16 rounded bg-gray-200 dark:bg-gray-700 animate-pulse mb-2" />
            <div className="h-3 w-40 rounded bg-gray-100 dark:bg-gray-800 animate-pulse" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6 mt-4">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="h-3 w-32 rounded bg-gray-200 dark:bg-gray-700 animate-pulse mb-4" />
            <div className="space-y-3">
              {[...Array(3)].map((_, j) => (
                <div key={j} className="h-3 w-full rounded bg-gray-100 dark:bg-gray-800 animate-pulse" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ── Error banner ──────────────────────────────────────────────────────────────

function ErrorBanner({ error }: { error: string }) {
  return (
    <div className="col-span-12 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 dark:border-red-900/30 dark:bg-red-500/10">
      <div className="flex items-center gap-3">
        <svg className="w-5 h-5 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
        <div>
          <p className="text-sm font-medium text-red-700 dark:text-red-400">
            Could not connect to the backend
          </p>
          <p className="text-xs text-red-500 mt-0.5">
            {error} — Start it with:{" "}
            <code className="font-mono bg-red-100 dark:bg-red-900/30 px-1 rounded">
              uvicorn src.api:app --reload --port 8000
            </code>
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Dashboard page ────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const {
    stats, trend, scoreDist,
    recentTransactions, allTransactions,
    status, lastUpdated, error, isSSE, refresh,
    alerts, clearAlerts,
  } = useDashboardData();

  const isLoading = status === "loading";
  const monthName = new Date().toLocaleString("default", { month: "long" });

  return (
    <div className="grid grid-cols-12 gap-4 md:gap-6">

      {/* Header */}
      <div className="col-span-12">
        <div className="flex items-end gap-4">
          <h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">
            Dashboard
          </h1>
          <p className="text-2xl font-normal text-gray-500 dark:text-gray-400">
            | &nbsp;&nbsp;{monthName}
          </p>
        </div>
        <DashboardStatusBar
          status={status}
          lastUpdated={lastUpdated}
          error={error}
          isSSE={isSSE}
          onRefresh={refresh}
        />
      </div>

      {status === "error" && error && <ErrorBanner error={error} />}

      {/* Row 1 — Metrics */}
      <div className="col-span-12">
        {isLoading ? <MetricsSkeleton /> : <FraudMetrics stats={stats} />}
      </div>

      {/* Row 2 — Charts */}
      <div className="col-span-12 xl:col-span-8">
        {isLoading
          ? <ChartSkeleton height="h-[320px]" />
          : <FraudTrendChart trend={trend} />}
      </div>
      <div className="col-span-12 xl:col-span-4">
        {isLoading
          ? <ChartSkeleton height="h-[320px]" />
          : <RiskDistributionChart scoreDist={scoreDist} />}
      </div>

      {/* Row 3 — Table + Review Progress + Live Alerts */}
      <div className="col-span-12 xl:col-span-6 xl:h-[460px]">
        {isLoading
          ? <TableSkeleton />
          : <RecentTransactions transactions={recentTransactions} />}
      </div>
      <div className="col-span-12 xl:col-span-3 xl:h-[460px]">
        {isLoading
          ? <RadialSkeleton />
          : <ReviewProgressCard stats={stats} />}
      </div>
      <div className="col-span-12 xl:col-span-3 xl:h-[460px]">
        {isLoading
          ? <AlertSkeleton />
          : <FraudAlertFeed alerts={alerts} onClear={clearAlerts} />}
      </div>

      {/* Row 4 — Blockchain Audit */}
      <div className="col-span-12">
        {isLoading
          ? <AuditSkeleton />
          : <BlockchainAuditSection transactions={allTransactions} stats={stats} />}
      </div>

    </div>
  );
}