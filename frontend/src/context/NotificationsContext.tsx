"use client";
import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";

export type NotificationType = "fraud" | "freeze" | "review";

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  subtitle: string;
  href: string;
  at: Date;
  read: boolean;
}

interface NotificationsCtx {
  notifications: AppNotification[];
  unreadCount: number;
  latest: AppNotification | null;   // transient — drives the Dynamic Island pill
  markAllRead: () => void;
  dismissLatest: () => void;
  clearAll: () => void;
}

const Ctx = createContext<NotificationsCtx | null>(null);

const SSE_URL = `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/stream`;
const PENDING_REMINDER_MS = 5 * 60 * 1000;
const MAX = 20;

const money = (n: number) =>
  "RM " + n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface SnapTxn {
  transaction_id: string;
  predicted_label: string;
  merchant_name: string;
  amount_myr: number;
  card_frozen?: boolean;
}

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [latest, setLatest] = useState<AppNotification | null>(null);

  const esRef        = useRef<EventSource | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seen         = useRef<Set<string>>(new Set());
  const firstPayload = useRef(true);
  const pendingRef   = useRef(0);

  const push = useCallback((n: Pick<AppNotification, "type" | "title" | "subtitle" | "href">) => {
    const item: AppNotification = {
      ...n,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      at: new Date(),
      read: false,
    };
    setNotifications((prev) => [item, ...prev].slice(0, MAX));
    setLatest(item);
  }, []);

  // ── Single SSE connection feeding all notifications ──────────────────────────
  useEffect(() => {
    if (typeof window === "undefined" || !window.EventSource) return;
    let stopped = false;

    const connect = () => {
      const es = new EventSource(SSE_URL);
      esRef.current = es;

      es.addEventListener("dashboard", (e: MessageEvent) => {
        try {
          const p = JSON.parse(e.data) as {
            stats?: { total?: number; pending_review?: number };
            recent_transactions?: SnapTxn[];
          };
          pendingRef.current = p.stats?.pending_review ?? 0;
          const txns = p.recent_transactions ?? [];

          if ((p.stats?.total ?? 0) === 0) {       // demo reset
            seen.current.clear();
            firstPayload.current = true;
            return;
          }
          if (firstPayload.current) {              // seed silently — no alerts on first snapshot
            firstPayload.current = false;
            txns.forEach((t) => seen.current.add(t.transaction_id));
            return;
          }
          for (const t of txns) {
            if (seen.current.has(t.transaction_id)) continue;
            seen.current.add(t.transaction_id);
            if (t.predicted_label !== "FRAUD") continue;
            if (t.card_frozen) {
              push({ type: "freeze", title: "Card frozen", subtitle: `${t.merchant_name} · ${money(t.amount_myr)}`, href: "/frozen-cards" });
            } else {
              push({ type: "fraud", title: "Fraud detected", subtitle: `${t.merchant_name} · ${money(t.amount_myr)}`, href: "/basic-tables" });
            }
          }
        } catch {
          /* malformed payload — ignore */
        }
      });

      es.addEventListener("reset", () => {
        seen.current.clear();
        firstPayload.current = true;
        setNotifications([]);
        setLatest(null);
      });

      es.addEventListener("error", (ev: Event) => {
        if (ev instanceof MessageEvent) return; // server-sent error frame, stream alive
        es.close();
        esRef.current = null;
        if (!stopped) reconnectRef.current = setTimeout(connect, 5000);
      });
    };

    connect();
    return () => {
      stopped = true;
      esRef.current?.close();
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
    };
  }, [push]);

  // ── Pending-review reminder, re-pings every 5 min ────────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      const p = pendingRef.current;
      if (p > 0) {
        push({
          type: "review",
          title: "Pending reviews",
          subtitle: `${p} transaction${p === 1 ? "" : "s"} awaiting review`,
          href: "/basic-tables",
        });
      }
    }, PENDING_REMINDER_MS);
    return () => clearInterval(id);
  }, [push]);

  const unreadCount = notifications.filter((n) => !n.read).length;
  const markAllRead = useCallback(() => setNotifications((prev) => prev.map((n) => ({ ...n, read: true }))), []);
  const dismissLatest = useCallback(() => setLatest(null), []);
  const clearAll = useCallback(() => { setNotifications([]); setLatest(null); }, []);

  return (
    <Ctx.Provider value={{ notifications, unreadCount, latest, markAllRead, dismissLatest, clearAll }}>
      {children}
    </Ctx.Provider>
  );
}

export function useNotifications(): NotificationsCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useNotifications must be used within NotificationsProvider");
  return ctx;
}
