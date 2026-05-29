"use client";
import React, { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { getMyReviewStats, changePassword, type ReviewStats } from "@/services/fraudApi";

// Initials for the avatar, e.g. "analyst1" → "AN", "jane doe" → "JD".
function initials(name: string): string {
  const parts = name.trim().split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

// JWT expiry (exp claim, seconds) straight from the stored token.
function sessionExpiry(): Date | null {
  if (typeof window === "undefined") return null;
  const token = localStorage.getItem("auth_token");
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.exp ? new Date(payload.exp * 1000) : null;
  } catch {
    return null;
  }
}

const money = (n: number) =>
  "RM " + n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-gray-800 dark:text-white/90">{value}</p>
    </div>
  );
}

function StatTile({ label, value, accent }: { label: string; value: React.ReactNode; accent?: string }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-white/[0.03]">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`mt-1 text-xl font-bold ${accent ?? "text-gray-800 dark:text-white/90"}`}>{value}</p>
    </div>
  );
}

export default function AnalystProfile() {
  const { user, logout } = useAuth();

  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);

  // Change-password form
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let active = true;
    getMyReviewStats()
      .then((s) => { if (active) { setStats(s); setStatsError(null); } })
      .catch((e) => { if (active) setStatsError(e instanceof Error ? e.message : "Failed to load activity"); });
    return () => { active = false; };
  }, []);

  if (!user) return null;

  const expiry = sessionExpiry();
  const roleLabel = user.role.charAt(0).toUpperCase() + user.role.slice(1);

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwMsg(null);
    if (next.length < 6) { setPwMsg({ ok: false, text: "New password must be at least 6 characters." }); return; }
    if (next !== confirm) { setPwMsg({ ok: false, text: "New password and confirmation don't match." }); return; }
    setPwBusy(true);
    try {
      await changePassword(current, next);
      setPwMsg({ ok: true, text: "Password updated." });
      setCurrent(""); setNext(""); setConfirm("");
    } catch (err) {
      setPwMsg({ ok: false, text: err instanceof Error ? err.message : "Failed to change password." });
    } finally {
      setPwBusy(false);
    }
  };

  const input =
    "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200";

  return (
    <div className="space-y-6">
      {/* Identity & session */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-500 text-xl font-semibold text-white">
              {initials(user.username)}
            </div>
            <div>
              <h4 className="text-lg font-semibold text-gray-800 dark:text-white/90">{user.username}</h4>
              <div className="mt-1 flex items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-600 dark:bg-brand-500/15 dark:text-brand-400">
                  {roleLabel}
                </span>
                <span className="text-sm text-gray-500 dark:text-gray-400">Fraud Analyst</span>
              </div>
            </div>
          </div>
          <button
            onClick={logout}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-error-300 px-4 py-2 text-sm font-medium text-error-600 transition hover:bg-error-50 dark:border-error-500/40 dark:text-error-400 dark:hover:bg-error-500/10"
          >
            Sign out
          </button>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-5 border-t border-gray-100 pt-5 dark:border-gray-800 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Username" value={user.username} />
          <Field label="Role" value={roleLabel} />
          <Field label="User ID" value={`#${user.user_id}`} />
          <Field
            label="Session expires"
            value={expiry ? expiry.toLocaleString("en-MY", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}
          />
        </div>
      </div>

      {/* Review activity */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
        <h3 className="mb-1 text-lg font-semibold text-gray-800 dark:text-white/90">My review activity</h3>
        <p className="mb-5 text-sm text-gray-500 dark:text-gray-400">
          Transactions you’ve reviewed under <span className="font-medium">{user.username}</span>.
        </p>
        {statsError ? (
          <p className="text-sm text-error-500">{statsError}</p>
        ) : !stats ? (
          <p className="text-sm text-gray-400">Loading activity…</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <StatTile label="Reviews done" value={stats.reviews_done.toLocaleString()} />
            <StatTile label="Confirmed fraud" value={stats.confirmed_fraud.toLocaleString()} accent="text-error-500" />
            <StatTile label="Cleared (legit)" value={stats.cleared.toLocaleString()} accent="text-emerald-500" />
            <StatTile label="Cards unfrozen" value={stats.cards_unfrozen.toLocaleString()} />
            <StatTile label="Amount approved" value={money(stats.amount_approved)} />
          </div>
        )}
      </div>

      {/* Change password */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
        <h3 className="mb-5 text-lg font-semibold text-gray-800 dark:text-white/90">Change password</h3>
        <form onSubmit={submitPassword} className="max-w-md space-y-4">
          <div>
            <label className="mb-1 block text-sm text-gray-600 dark:text-gray-400">Current password</label>
            <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} className={input} autoComplete="current-password" />
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-600 dark:text-gray-400">New password</label>
            <input type="password" value={next} onChange={(e) => setNext(e.target.value)} className={input} autoComplete="new-password" />
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-600 dark:text-gray-400">Confirm new password</label>
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={input} autoComplete="new-password" />
          </div>
          {pwMsg && (
            <p className={`text-sm ${pwMsg.ok ? "text-emerald-600 dark:text-emerald-400" : "text-error-500"}`}>{pwMsg.text}</p>
          )}
          <button
            type="submit"
            disabled={pwBusy || !current || !next || !confirm}
            className="inline-flex items-center rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-600 disabled:opacity-50"
          >
            {pwBusy ? "Updating…" : "Update password"}
          </button>
        </form>
      </div>
    </div>
  );
}
