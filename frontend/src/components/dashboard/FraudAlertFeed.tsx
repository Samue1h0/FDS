"use client";

import { useEffect, useState } from "react";
import type { AlertEntry } from "@/hooks/useDashboardData";

interface FraudAlertFeedProps {
  alerts:   AlertEntry[];
  onClear:  () => void;
}

function getTimeLabel(date: Date): string {
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60)   return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return date.toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit" });
}

function AlertItem({ alert }: { alert: AlertEntry }) {
  const [fresh, setFresh] = useState(() => Date.now() - alert.alertedAt.getTime() < 8_000);
  const [timeLabel, setTimeLabel] = useState(() => getTimeLabel(alert.alertedAt));

  useEffect(() => {
    if (!fresh) return;
    const remaining = 8_000 - (Date.now() - alert.alertedAt.getTime());
    if (remaining <= 0) { setFresh(false); return; }
    const t = setTimeout(() => setFresh(false), remaining);
    return () => clearTimeout(t);
  }, [fresh, alert.alertedAt]);

  useEffect(() => {
    const t = setInterval(() => setTimeLabel(getTimeLabel(alert.alertedAt)), 15_000);
    return () => clearInterval(t);
  }, [alert.alertedAt]);

  const scoreColor =
    alert.fraud_score >= 0.8
      ? "text-red-600 dark:text-red-400"
      : alert.fraud_score >= 0.6
      ? "text-orange-500 dark:text-orange-400"
      : "text-yellow-600 dark:text-yellow-400";

  return (
    <div
      className={`flex items-start gap-3 rounded-xl border p-3 transition-colors duration-700 ${
        fresh
          ? "border-red-300 bg-red-50 dark:border-red-700/40 dark:bg-red-500/10"
          : "border-red-100 bg-red-50/50 dark:border-red-900/20 dark:bg-red-500/5"
      }`}
    >
      <div className="mt-1 shrink-0">
        {fresh ? (
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
          </span>
        ) : (
          <span className="inline-flex h-2 w-2 rounded-full bg-red-300 dark:bg-red-700" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-xs font-semibold text-gray-800 dark:text-white/90">
            {alert.merchant_name}
          </p>
          <span className={`shrink-0 text-xs font-bold ${scoreColor}`}>
            {Math.round(alert.fraud_score * 100)}%
          </span>
        </div>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
          MYR {alert.amount_myr.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
        {alert.risk_reasons[0] && (
          <p className="mt-0.5 truncate text-xs text-red-500 dark:text-red-400">
            {alert.risk_reasons[0]}
          </p>
        )}
        <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{timeLabel}</p>
      </div>
    </div>
  );
}

export default function FraudAlertFeed({ alerts, onClear }: FraudAlertFeedProps) {
  return (
    <div className="flex flex-col h-full rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">

      {/* Header */}
      <div className="flex items-start justify-between px-5 pt-5 pb-3 sm:px-6 sm:pt-6">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">Live Alerts</h3>
            {alerts.length > 0 && (
              <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white">
                {alerts.length}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Real-time fraud detections
          </p>
        </div>
        {alerts.length > 0 && (
          <button
            onClick={onClear}
            className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
          >
            Clear
          </button>
        )}
      </div>

      {/* Body */}
      {alerts.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-5 py-12 text-center">
          <svg
            className="mb-3 h-10 w-10 text-gray-300 dark:text-gray-600"
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
            />
          </svg>
          <p className="text-sm font-medium text-gray-400 dark:text-gray-500">No fraud alerts</p>
          <p className="mt-1 text-xs text-gray-300 dark:text-gray-600">Alerts appear here in real time</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto custom-scrollbar px-5 pb-5 sm:px-6">
          <div className="space-y-2">
            {alerts.map(alert => (
              <AlertItem key={alert.transaction_id} alert={alert} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
