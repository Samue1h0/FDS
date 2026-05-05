"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  getTransactions,
  type Stats,
  type FraudTrendEntry,
  type ScoreDistributionEntry,
  type Transaction,
} from "@/services/fraudApi";

const FALLBACK_POLL_MS = 30_000;
const SSE_RECONNECT_MS = 5_000;

export type DashboardStatus = "loading" | "live" | "error" | "stale" | "reconnecting";

export interface AlertEntry {
  transaction_id: string;
  merchant_name:  string;
  amount_myr:     number;
  fraud_score:    number;
  timestamp:      string;
  risk_reasons:   string[];
  alertedAt:      Date;
}

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

export function useDashboardData(): DashboardData {
  const SSE_URL = `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/stream`;

  const [stats,              setStats]      = useState<Stats | null>(null);
  const [trend,              setTrend]      = useState<FraudTrendEntry[]>([]);
  const [scoreDist,          setScoreDist]  = useState<ScoreDistributionEntry[]>([]);
  const [recentTransactions, setRecent]     = useState<Transaction[]>([]);
  const [allTransactions,    setAll]        = useState<Transaction[]>([]);
  const [status,             setStatus]     = useState<DashboardStatus>("loading");
  const [lastUpdated,        setLastUpdated] = useState<Date | null>(null);
  const [error,              setError]      = useState<string | null>(null);
  const [isSSE,              setIsSSE]      = useState(false);

  const [alerts, setAlerts] = useState<AlertEntry[]>([]);

  const esRef            = useRef<EventSource | null>(null);
  const fallbackRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seenTxIds        = useRef<Set<string>>(new Set());
  const isFirstPayload   = useRef(true);
  const isResetting      = useRef(false);

  const clearAlerts = useCallback(() => setAlerts([]), []);

  // ── Fetch all transactions for BlockchainAuditSection ────────────────────
  const fetchAllTransactions = useCallback(async () => {
    try {
      const res = await getTransactions({ limit: 200 });
      setAll(res.transactions);
    } catch {
      // non-critical
    }
  }, []);

  // ── Apply SSE payload to state ────────────────────────────────────────────
  const applyPayload = useCallback((payload: {
    stats:               Stats;
    trend:               FraudTrendEntry[];
    score_distribution:  ScoreDistributionEntry[];
    recent_transactions: Transaction[];
  }) => {
    setStats(payload.stats);
    setTrend(payload.trend ?? []);
    setScoreDist(payload.score_distribution ?? []);
    setStatus("live");
    setLastUpdated(new Date());
    setError(null);

    const txns: Transaction[] = payload.recent_transactions ?? [];
    setRecent(txns);

    if (payload.stats.total === 0) {
      // Demo reset — wipe alert state so the feed starts clean
      seenTxIds.current.clear();
      setAlerts([]);
      isFirstPayload.current = true;
    } else if (isFirstPayload.current) {
      // Seed seen IDs from the initial snapshot without alerting
      isFirstPayload.current = false;
      txns.forEach(tx => seenTxIds.current.add(tx.transaction_id));
    } else {
      // Subsequent pushes — alert on any FRAUD we haven't seen yet
      const newAlerts: AlertEntry[] = txns
        .filter(tx => tx.predicted_label === "FRAUD" && !seenTxIds.current.has(tx.transaction_id))
        .map(tx => ({
          transaction_id: tx.transaction_id,
          merchant_name:  tx.merchant_name,
          amount_myr:     tx.amount_myr,
          fraud_score:    tx.fraud_score,
          timestamp:      tx.timestamp,
          risk_reasons:   tx.risk_reasons ?? [],
          alertedAt:      new Date(),
        }));
      txns.forEach(tx => seenTxIds.current.add(tx.transaction_id));
      if (newAlerts.length > 0) {
        setAlerts(prev => [...newAlerts, ...prev].slice(0, 20));
      }
    }
  }, []);

  // ── Fallback polling (ONLY used when SSE is disconnected) ─────────────────
  const startPolling = useCallback(() => {
    if (fallbackRef.current) return;

    const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

    const poll = async () => {
      setStatus((prev) => (prev === "loading" ? "loading" : "stale"));
      try {
        const [statsRes, trendRes, scoreRes, recentRes] = await Promise.allSettled([
          fetch(`${BASE}/api/stats`).then((r) => r.json()),
          fetch(`${BASE}/api/charts/fraud-trend`).then((r) => r.json()),
          fetch(`${BASE}/api/charts/score-distribution`).then((r) => r.json()),
          getTransactions({ limit: 8 }),
        ]);

        if ([statsRes, trendRes, scoreRes, recentRes].every((r) => r.status === "rejected")) {
          setStatus("error");
          setError("Cannot reach the backend. Check that FastAPI is running.");
          return;
        }

        if (statsRes.status  === "fulfilled") setStats(statsRes.value);
        if (trendRes.status  === "fulfilled") setTrend(Array.isArray(trendRes.value) ? trendRes.value : []);
        if (scoreRes.status  === "fulfilled") setScoreDist(scoreRes.value ?? []);
        if (recentRes.status === "fulfilled") setRecent(recentRes.value.transactions ?? []);

        setStatus("live");
        setLastUpdated(new Date());
        setError(null);
      } catch {
        setStatus("error");
        setError("Cannot reach the backend.");
      }
    };

    poll();
    fallbackRef.current = setInterval(poll, FALLBACK_POLL_MS);
    setIsSSE(false);
  }, []);

  const stopPolling = useCallback(() => {
    if (fallbackRef.current) {
      clearInterval(fallbackRef.current);
      fallbackRef.current = null;
    }
  }, []);

  // ── SSE connection ────────────────────────────────────────────────────────
  const connectSSE = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    if (reconnectTimeout.current) {
      clearTimeout(reconnectTimeout.current);
      reconnectTimeout.current = null;
    }

    if (typeof window === "undefined" || !window.EventSource) {
      startPolling();
      return;
    }

    setStatus((prev) => (prev === "loading" ? "loading" : "reconnecting"));

    const es = new EventSource(SSE_URL);
    esRef.current = es;

    // SSE event received — apply payload and update dashboard immediately
    es.addEventListener("dashboard", (e: MessageEvent) => {
      try {
        const payload = JSON.parse(e.data);
        applyPayload(payload);
        setIsSSE(true);
        stopPolling(); // SSE is working, stop any fallback polling

        // Also refresh allTransactions for the audit section
        fetchAllTransactions();
      } catch {
        // malformed payload — ignore
      }
    });

    // Reset event — clear all state immediately. The server closes the SSE
    // connection after sending this event, which triggers the error handler
    // below to reconnect. isResetting skips the normal 5s backoff delay.
    es.addEventListener("reset", () => {
      isResetting.current = true;
      setStats(null);
      setTrend([]);
      setScoreDist([]);
      setRecent([]);
      setAll([]);
      setAlerts([]);
      seenTxIds.current.clear();
      isFirstPayload.current = false;
      setStatus("loading");
      setIsSSE(false);
      stopPolling();
    });

    // SSE error handler — must distinguish two very different cases:
    // 1. MessageEvent  → server sent "event: error\ndata: ..." (stream still alive, ignore)
    // 2. plain Event   → real TCP/network drop (close, fall back to polling, reconnect)
    es.addEventListener("error", (e: Event) => {
      if (e instanceof MessageEvent) return;

      const delay = isResetting.current ? 0 : SSE_RECONNECT_MS;
      isResetting.current = false;

      if (!fallbackRef.current) startPolling();
      setIsSSE(false);
      setStatus("reconnecting");

      es.close();
      esRef.current = null;
      reconnectTimeout.current = setTimeout(connectSSE, delay);
    });
  }, [SSE_URL, applyPayload, startPolling, stopPolling, fetchAllTransactions]);

  // ── Mount / unmount ───────────────────────────────────────────────────────
  useEffect(() => {
    connectSSE();
    fetchAllTransactions();

    return () => {
      esRef.current?.close();
      if (fallbackRef.current)      clearInterval(fallbackRef.current);
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
    };
  }, [connectSSE, fetchAllTransactions]);

  // ── Manual refresh ────────────────────────────────────────────────────────
  const refresh = useCallback(() => {
    connectSSE();
    fetchAllTransactions();
  }, [connectSSE, fetchAllTransactions]);

  return {
    stats,
    trend,
    scoreDist,
    recentTransactions,
    allTransactions,
    status,
    lastUpdated,
    error,
    isSSE,
    refresh,
    alerts,
    clearAlerts,
  };
}