"use client";

import React, { useEffect, useState, useCallback } from "react";
import { getDemoStatus, runDemo, stopDemo, resetDemoData } from "@/services/fraudApi";

/**
 * Dashboard demo controls. Three buttons:
 *   - Run Demo / Stop Demo (toggles based on /internal/demo-status)
 *   - Reset Demo (deletes is_demo=true rows, stops if running)
 * Polls status every 5s. Live indicator pulses while running.
 */
export default function DemoControls() {
  const [running, setRunning] = useState(false);
  const [busy, setBusy]       = useState(false);
  // /internal/* (incl. demo-status) is local-only and 403s through the tunnel,
  // so these controls only work — and only show — when served from a local host.
  const [isLocal, setIsLocal] = useState(false);

  useEffect(() => {
    const h = window.location.hostname;
    setIsLocal(h === "localhost" || h === "127.0.0.1");
  }, []);

  const refresh = useCallback(async () => {
    try {
      const s = await getDemoStatus();
      setRunning(s.running);
    } catch {
      // backend may be down; leave state as-is
    }
  }, []);

  useEffect(() => {
    if (!isLocal) return;
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [isLocal, refresh]);

  if (!isLocal) return null;

  const onRun = async () => {
    setBusy(true);
    try {
      await runDemo({ delay: 2.0 });
      await refresh();
    } catch (e) {
      alert((e as Error).message ?? "Failed to start demo");
    } finally {
      setBusy(false);
    }
  };

  const onStop = async () => {
    setBusy(true);
    try {
      await stopDemo();
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const onReset = async () => {
    if (!confirm("Delete all demo transactions? Historical data is untouched.")) return;
    setBusy(true);
    try {
      const r = await resetDemoData();
      alert(`Cleared ${r.deleted} demo transactions.`);
      await refresh();
    } catch (e) {
      alert((e as Error).message ?? "Reset failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="inline-flex items-center gap-2">
      {/* Run / Stop */}
      {running ? (
        <button
          onClick={onStop}
          disabled={busy}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-red-500 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-red-600 disabled:opacity-50"
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
          </span>
          Stop Demo
        </button>
      ) : (
        <button
          onClick={onRun}
          disabled={busy}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-emerald-500 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-emerald-600 disabled:opacity-50"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
            <path d="M6 4l10 6-10 6V4z" />
          </svg>
          Run Demo
        </button>
      )}

      {/* Reset */}
      <button
        onClick={onReset}
        disabled={busy}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
        title="Delete demo transactions (historical data untouched)"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M4 7h12M9 3h2m-5 4l1 9a2 2 0 002 2h4a2 2 0 002-2l1-9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Reset Demo
      </button>
    </div>
  );
}
