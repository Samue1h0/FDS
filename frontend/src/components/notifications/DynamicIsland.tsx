"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useNotifications, type NotificationType } from "@/context/LiveContext";

// How many toasts can stack at once. A new one over the cap evicts the oldest
// immediately (no fade). Each toast drops in, holds, then fades away.
const MAX_TOASTS = 3;
const HOLD_MS    = 5000;
const FADE_MS    = 400;

// Whole-pill vibrant style per type, using the app's semantic theme tokens so it
// matches the rest of the UI: freeze = warning amber (reads as a warning), fraud
// = error red (danger), review = brand blue (info), unfreeze = success green
// (the all-clear, the positive counterpart to freeze).
const STYLE: Record<NotificationType, { pill: string; badge: string; title: string; sub: string }> = {
  fraud:    { pill: "bg-gradient-to-r from-error-500 to-error-600",     badge: "bg-white/25 text-white",       title: "text-white",    sub: "text-white/85" },
  freeze:   { pill: "bg-gradient-to-r from-warning-400 to-warning-500", badge: "bg-gray-900/15 text-gray-900", title: "text-gray-900", sub: "text-gray-900/75" },
  review:   { pill: "bg-gradient-to-r from-brand-400 to-brand-500",     badge: "bg-white/25 text-white",       title: "text-white",    sub: "text-white/85" },
  unfreeze: { pill: "bg-gradient-to-r from-success-500 to-success-600", badge: "bg-white/25 text-white",       title: "text-white",    sub: "text-white/85" },
};

interface Toast {
  id: string;
  type: NotificationType;
  title: string;
  subtitle: string;
  href: string;
}

function Icon({ type }: { type: NotificationType }) {
  const cls = "h-4 w-4";
  if (type === "freeze") {
    return (
      <svg className={cls} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
        <rect x="4" y="9" width="12" height="8" rx="2" /><path d="M7 9V7a3 3 0 016 0v2" strokeLinecap="round" />
      </svg>
    );
  }
  if (type === "review") {
    return (
      <svg className={cls} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
        <circle cx="10" cy="10" r="7" /><path d="M10 6v4l2.5 1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (type === "unfreeze") {
    // Open padlock — the freeze lock, released.
    return (
      <svg className={cls} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
        <rect x="4" y="9" width="12" height="8" rx="2" /><path d="M7 9V7a3 3 0 015.83-1" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg className={cls} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M10 3 2.5 16.5h15L10 3z" strokeLinejoin="round" /><path d="M10 8v3.5M10 14h.01" strokeLinecap="round" />
    </svg>
  );
}

// One self-managing toast: animates in, holds, fades out, then asks to be removed.
function ToastItem({ toast, onClose, onActivate }: {
  toast: Toast;
  onClose: (id: string) => void;
  onActivate: (toast: Toast) => void;
}) {
  const [leaving, setLeaving] = useState(false);
  const s = STYLE[toast.type];

  useEffect(() => {
    const fade   = setTimeout(() => setLeaving(true), HOLD_MS);
    const remove = setTimeout(() => onClose(toast.id), HOLD_MS + FADE_MS);
    return () => { clearTimeout(fade); clearTimeout(remove); };
  }, [toast.id, onClose]);

  return (
    <button
      onClick={() => onActivate(toast)}
      className={`${leaving ? "animate-island-out" : "animate-island-in"} pointer-events-auto flex w-full items-center gap-3 rounded-2xl ${s.pill} py-2.5 pl-3 pr-5 text-left shadow-2xl ring-1 ring-black/5`}
    >
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${s.badge}`}>
        <Icon type={toast.type} />
      </span>
      <span className="min-w-0">
        <span className={`block text-sm font-semibold leading-tight ${s.title}`}>{toast.title}</span>
        <span className={`block truncate text-xs ${s.sub}`}>{toast.subtitle}</span>
      </span>
    </button>
  );
}

// Phone-style notification stack. Freeze toasts drop everywhere (including the
// dashboard); fraud/review only off-dashboard, so the dashboard's own live feed
// isn't doubled up during fraud bursts. The header bell still logs all of them.
export default function DynamicIsland() {
  const pathname = usePathname();
  const router = useRouter();
  const { latest } = useNotifications();

  const [toasts, setToasts] = useState<Toast[]>([]);
  // Track the last notification we've already reacted to (even ones we chose
  // not to show), so navigating later never re-pops a stale notification.
  const lastSeenId = useRef<string | null>(null);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const activate = useCallback((t: Toast) => {
    router.push(t.href);
    removeToast(t.id);
  }, [router, removeToast]);

  useEffect(() => {
    if (!latest || latest.id === lastSeenId.current) return;
    lastSeenId.current = latest.id;

    // Freeze/unfreeze are the hero events — always show them, dashboard included.
    // Fraud/review only off-dashboard (the dashboard has its own live feed).
    const onDashboard = pathname === "/";
    if (latest.type !== "freeze" && latest.type !== "unfreeze" && onDashboard) return;

    const toast: Toast = {
      id: latest.id, type: latest.type, title: latest.title,
      subtitle: latest.subtitle, href: latest.href,
    };
    // Newest on top; cap the stack — anything past MAX_TOASTS (the oldest) is
    // dropped immediately, no fade.
    setToasts((prev) => [toast, ...prev].slice(0, MAX_TOASTS));
  }, [latest, pathname]);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed right-4 top-20 z-[100000] flex w-[22rem] max-w-[calc(100vw-2rem)] flex-col gap-2 print:hidden">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onClose={removeToast} onActivate={activate} />
      ))}
    </div>
  );
}
