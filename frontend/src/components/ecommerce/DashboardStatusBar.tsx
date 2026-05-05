"use client";

import { DashboardStatus } from "@/hooks/useDashboardData";

interface DashboardStatusBarProps {
  status:      DashboardStatus;
  lastUpdated: Date | null;
  error:       string | null;
  isSSE:       boolean;
  onRefresh:   () => void;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-MY", {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

export default function DashboardStatusBar({
  status, lastUpdated, error, isSSE, onRefresh,
}: DashboardStatusBarProps) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="flex items-center gap-2">

        {/* Status dot */}
        {status === "loading" && (
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
          </span>
        )}
        {status === "live" && (
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
          </span>
        )}
        {(status === "stale" || status === "reconnecting") && (
          <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-400" />
        )}
        {status === "error" && (
          <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
        )}

        {/* Status text */}
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {status === "loading" && "Connecting..."}

          {status === "live" && lastUpdated && (
            <>
              {isSSE ? (
                <span className="text-green-600 dark:text-green-400 font-medium">Real-time</span>
              ) : (
                <span>Polling</span>
              )}
              {" · "}
              Updated{" "}
              <span className="font-medium text-gray-700 dark:text-gray-300">
                {formatTime(lastUpdated)}
              </span>
              {!isSSE && " · Auto-refreshes every 30s"}
            </>
          )}

          {status === "stale" && "Refreshing..."}

          {status === "reconnecting" && (
            <span className="text-yellow-600 dark:text-yellow-400">
              SSE disconnected — reconnecting, using polling as fallback
            </span>
          )}

          {status === "error" && (
            <span className="text-red-500 dark:text-red-400">
              {error ?? "Backend unreachable"}
            </span>
          )}
        </span>
      </div>

      {/* Manual refresh button */}
      <button
        onClick={onRefresh}
        disabled={status === "loading" || status === "stale"}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 shadow-sm hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
      >
        <svg
          className={`w-3.5 h-3.5 ${status === "stale" || status === "reconnecting" ? "animate-spin" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        Refresh
      </button>
    </div>
  );
}