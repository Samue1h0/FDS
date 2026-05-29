"use client";

import { useEffect, useState, useCallback } from "react";
import { getTransactions, type Stats, type FraudTrendEntry, type ScoreDistributionEntry, type Transaction } from "@/services/fraudApi";
import { useLive } from "@/context/LiveContext";

// Re-exported from the unified LiveContext (single SSE source) so existing
// imports (DashboardStatusBar, FraudAlertFeed) keep working unchanged.
export type { DashboardStatus, AlertEntry } from "@/context/LiveContext";
import type { DashboardStatus, AlertEntry } from "@/context/LiveContext";

export interface DashboardData {
  stats:               Stats | null;
  trend:               FraudTrendEntry[];
  scoreDist:           ScoreDistributionEntry[];
  recentTransactions:  Transaction[];
  allTransactions:     Transaction[];
  status:              DashboardStatus;
  lastUpdated:         Date | null;
  error:               string | null;
  isSSE:               boolean;
  refresh:             () => void;
  alerts:              AlertEntry[];
  clearAlerts:         () => void;
}

// Thin selector over LiveProvider's single SSE stream, plus the dashboard-only
// allTransactions fetch (used by BlockchainAuditSection). Refetches whenever a
// new live payload lands (lastUpdated changes).
export function useDashboardData(): DashboardData {
  const live = useLive();
  const [allTransactions, setAll] = useState<Transaction[]>([]);

  const fetchAllTransactions = useCallback(async () => {
    try {
      const res = await getTransactions({ limit: 200 });
      setAll(res.transactions);
    } catch {
      // non-critical
    }
  }, []);

  useEffect(() => {
    let active = true;
    getTransactions({ limit: 200 })
      .then((res) => { if (active) setAll(res.transactions); })
      .catch(() => { /* non-critical */ });
    return () => { active = false; };
  }, [live.lastUpdated]);

  const refresh = useCallback(() => {
    live.refresh();
    fetchAllTransactions();
  }, [live, fetchAllTransactions]);

  return {
    stats:              live.stats,
    trend:              live.trend,
    scoreDist:          live.scoreDist,
    recentTransactions: live.recentTransactions,
    allTransactions,
    status:             live.status,
    lastUpdated:        live.lastUpdated,
    error:              live.error,
    isSSE:              live.isSSE,
    refresh,
    alerts:             live.alerts,
    clearAlerts:        live.clearAlerts,
  };
}
