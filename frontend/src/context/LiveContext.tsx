"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import {
  getTransactions,
  type Stats,
  type FraudTrendEntry,
  type ScoreDistributionEntry,
  type Transaction,
} from "@/services/fraudApi";

// Single live data source for the whole admin app: ONE SSE connection feeding
// both the dashboard (stats/trend/recent/alerts) and the notifications
// (header bell + Dynamic Island). Mounted once in (admin)/layout.tsx.

const FALLBACK_POLL_MS = 30_000;
const SSE_RECONNECT_MS = 5_000;
const PENDING_REMINDER_MS = 5 * 60 * 1000;

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

export type NotificationType = "fraud" | "freeze" | "review" | "unfreeze";

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  subtitle: string;
  href: string;
  at: Date;
  read: boolean;
}

interface LiveCtx {
  // dashboard live data
  stats:              Stats | null;
  trend:              FraudTrendEntry[];
  scoreDist:          ScoreDistributionEntry[];
  recentTransactions: Transaction[];
  status:             DashboardStatus;
  lastUpdated:        Date | null;
  error:              string | null;
  isSSE:              boolean;
  refresh:            () => void;
  alerts:             AlertEntry[];
  clearAlerts:        () => void;
  // notifications
  notifications:      AppNotification[];
  unreadCount:        number;
  latest:             AppNotification | null;
  markAllRead:        () => void;
  dismissLatest:      () => void;
  clearAll:           () => void;
}

const Ctx = createContext<LiveCtx | null>(null);

const money = (n: number) =>
  "RM " + n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function LiveProvider({ children }: { children: React.ReactNode }) {
  const SSE_URL = `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/stream`;

  const [stats,              setStats]       = useState<Stats | null>(null);
  const [trend,              setTrend]       = useState<FraudTrendEntry[]>([]);
  const [scoreDist,          setScoreDist]   = useState<ScoreDistributionEntry[]>([]);
  const [recentTransactions, setRecent]      = useState<Transaction[]>([]);
  const [status,             setStatus]      = useState<DashboardStatus>("loading");
  const [lastUpdated,        setLastUpdated] = useState<Date | null>(null);
  const [error,              setError]       = useState<string | null>(null);
  const [isSSE,              setIsSSE]       = useState(false);
  const [alerts,             setAlerts]      = useState<AlertEntry[]>([]);
  const [notifications,      setNotifications] = useState<AppNotification[]>([]);
  const [latest,             setLatest]      = useState<AppNotification | null>(null);

  const esRef            = useRef<EventSource | null>(null);
  const fallbackRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seenTxIds        = useRef<Set<string>>(new Set());
  const isFirstPayload   = useRef(true);
  const isResetting      = useRef(false);
  const pendingRef       = useRef(0);

  const clearAlerts   = useCallback(() => setAlerts([]), []);
  const markAllRead   = useCallback(() => setNotifications((prev) => prev.map((n) => ({ ...n, read: true }))), []);
  const dismissLatest = useCallback(() => setLatest(null), []);
  const clearAll      = useCallback(() => { setNotifications([]); setLatest(null); }, []);

  const pushNotif = useCallback((n: Pick<AppNotification, "type" | "title" | "subtitle" | "href">) => {
    const item: AppNotification = {
      ...n,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      at: new Date(),
      read: false,
    };
    setNotifications((prev) => [item, ...prev].slice(0, 20));
    setLatest(item);
  }, []);

  // ── Apply an SSE/poll payload → dashboard state + alerts + notifications ─────
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

    pendingRef.current = payload.stats?.pending_review ?? 0;
    const txns: Transaction[] = payload.recent_transactions ?? [];
    setRecent(txns);

    if (payload.stats.total === 0) {
      // Demo reset — wipe alert/notification state so everything starts clean
      seenTxIds.current.clear();
      setAlerts([]);
      isFirstPayload.current = true;
    } else if (isFirstPayload.current) {
      // Seed seen IDs from the initial snapshot without alerting
      isFirstPayload.current = false;
      txns.forEach((tx) => seenTxIds.current.add(tx.transaction_id));
    } else {
      // Subsequent pushes — react to any FRAUD we haven't seen yet
      const newAlerts: AlertEntry[] = [];
      for (const tx of txns) {
        if (tx.predicted_label !== "FRAUD" || seenTxIds.current.has(tx.transaction_id)) continue;
        newAlerts.push({
          transaction_id: tx.transaction_id,
          merchant_name:  tx.merchant_name,
          amount_myr:     tx.amount_myr,
          fraud_score:    tx.fraud_score,
          timestamp:      tx.timestamp,
          risk_reasons:   tx.risk_reasons ?? [],
          alertedAt:      new Date(),
        });
        if (tx.card_frozen) {
          pushNotif({ type: "freeze", title: "Card frozen", subtitle: `${tx.merchant_name} · ${money(tx.amount_myr)}`, href: "/frozen-cards" });
        } else {
          pushNotif({ type: "fraud", title: "Fraud detected", subtitle: `${tx.merchant_name} · ${money(tx.amount_myr)}`, href: "/basic-tables" });
        }
      }
      txns.forEach((tx) => seenTxIds.current.add(tx.transaction_id));
      if (newAlerts.length > 0) setAlerts((prev) => [...newAlerts, ...prev].slice(0, 20));
    }
  }, [pushNotif]);

  // ── Fallback polling (only while SSE is disconnected) ────────────────────────
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
        if (statsRes.status  === "fulfilled") { setStats(statsRes.value); pendingRef.current = statsRes.value?.pending_review ?? 0; }
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

  // ── SSE connection ───────────────────────────────────────────────────────────
  const connectSSE = useCallback(() => {
    if (esRef.current) { esRef.current.close(); esRef.current = null; }
    if (reconnectTimeout.current) { clearTimeout(reconnectTimeout.current); reconnectTimeout.current = null; }

    if (typeof window === "undefined" || !window.EventSource) {
      startPolling();
      return;
    }

    setStatus((prev) => (prev === "loading" ? "loading" : "reconnecting"));

    const es = new EventSource(SSE_URL);
    esRef.current = es;

    es.addEventListener("dashboard", (e: MessageEvent) => {
      try {
        applyPayload(JSON.parse(e.data));
        setIsSSE(true);
        stopPolling();
      } catch {
        /* malformed payload — ignore */
      }
    });

    es.addEventListener("unfreeze", (e: MessageEvent) => {
      try {
        const d = JSON.parse(e.data) as { merchant_name?: string; amount_myr?: number };
        const merchant = d.merchant_name || "Card";
        pushNotif({
          type: "unfreeze",
          title: "Card unfrozen",
          subtitle: `${merchant} · ${money(d.amount_myr ?? 0)} cleared`,
          href: "/frozen-cards",
        });
      } catch {
        /* malformed payload — ignore */
      }
    });

    es.addEventListener("reset", () => {
      isResetting.current = true;
      setStats(null); setTrend([]); setScoreDist([]); setRecent([]);
      setAlerts([]); setNotifications([]); setLatest(null);
      seenTxIds.current.clear();
      isFirstPayload.current = false;
      setStatus("loading");
      setIsSSE(false);
      stopPolling();
    });

    es.addEventListener("error", (e: Event) => {
      if (e instanceof MessageEvent) return; // server-sent error frame; stream alive
      const delay = isResetting.current ? 0 : SSE_RECONNECT_MS;
      isResetting.current = false;
      if (!fallbackRef.current) startPolling();
      setIsSSE(false);
      setStatus("reconnecting");
      es.close();
      esRef.current = null;
      reconnectTimeout.current = setTimeout(connectSSE, delay);
    });
  }, [SSE_URL, applyPayload, startPolling, stopPolling, pushNotif]);

  useEffect(() => {
    connectSSE();
    return () => {
      esRef.current?.close();
      if (fallbackRef.current)      clearInterval(fallbackRef.current);
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
    };
  }, [connectSSE]);

  // ── Pending-review reminder, re-pings every 5 min ────────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      const p = pendingRef.current;
      if (p > 0) {
        pushNotif({ type: "review", title: "Pending reviews", subtitle: `${p} transaction${p === 1 ? "" : "s"} awaiting review`, href: "/basic-tables" });
      }
    }, PENDING_REMINDER_MS);
    return () => clearInterval(id);
  }, [pushNotif]);

  const refresh = useCallback(() => connectSSE(), [connectSSE]);
  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <Ctx.Provider
      value={{
        stats, trend, scoreDist, recentTransactions, status, lastUpdated, error, isSSE, refresh, alerts, clearAlerts,
        notifications, unreadCount, latest, markAllRead, dismissLatest, clearAll,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useLive(): LiveCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useLive must be used within LiveProvider");
  return ctx;
}

export function useNotifications() {
  const { notifications, unreadCount, latest, markAllRead, dismissLatest, clearAll } = useLive();
  return { notifications, unreadCount, latest, markAllRead, dismissLatest, clearAll };
}
