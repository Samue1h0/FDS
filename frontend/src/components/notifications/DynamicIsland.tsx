"use client";
import React, { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useNotifications, type NotificationType } from "@/context/NotificationsContext";

const ACCENT: Record<NotificationType, string> = {
  fraud:  "bg-red-500",
  freeze: "bg-blue-500",
  review: "bg-amber-500",
};

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
  return (
    <svg className={cls} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M10 3 2.5 16.5h15L10 3z" strokeLinejoin="round" /><path d="M10 8v3.5M10 14h.01" strokeLinecap="round" />
    </svg>
  );
}

// Dynamic-Island-style pill that drops in when a new notification arrives.
// Hidden on the dashboard (the live feed is the cue there); auto-dismisses.
export default function DynamicIsland() {
  const pathname = usePathname();
  const router = useRouter();
  const { latest, dismissLatest } = useNotifications();

  useEffect(() => {
    if (!latest) return;
    const t = setTimeout(dismissLatest, 6000);
    return () => clearTimeout(t);
  }, [latest, dismissLatest]);

  if (pathname === "/" || !latest) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[9999] flex justify-center px-4 print:hidden">
      <button
        key={latest.id}
        onClick={() => { router.push(latest.href); dismissLatest(); }}
        className="animate-island-in pointer-events-auto flex max-w-sm items-center gap-3 rounded-full bg-gray-900/95 py-2.5 pl-3 pr-5 text-left text-white shadow-2xl ring-1 ring-white/10 backdrop-blur dark:bg-black/90"
      >
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white ${ACCENT[latest.type]}`}>
          <Icon type={latest.type} />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold leading-tight">{latest.title}</span>
          <span className="block truncate text-xs text-white/70">{latest.subtitle}</span>
        </span>
      </button>
    </div>
  );
}
