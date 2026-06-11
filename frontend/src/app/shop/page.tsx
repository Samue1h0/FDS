"use client";

// ─────────────────────────────────────────────────────────────────────────────
// /shop — the IoT "heist checkout" booth/kiosk page.
//
// Fraudster framing: the visitor has a stolen card and tries to buy something.
// They pick an item, crank the amount, ARM it (POST /api/iot/cart), then TAP the
// physical RFID card. The Arduino bridge reads the armed cart, fires ONE real
// transaction into the live pipeline, and this page polls for the REAL verdict
// (the same ML model + rule_engine the dashboard shows) — no faked result.
//
// The risk meter shown BEFORE the tap is only a client-side estimate (mirrors
// rule_engine) so the slider feels alive; the actual freeze/approve is decided
// by the backend on the real tap. Images are placeholders (picsum) — swap the
// `image` fields for real photos dropped in /public/shop/.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from "react";

const API = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(
  /\/$/,
  ""
);

// The notional "victim" whose card was stolen — their usual spend sets where the
// high-value rule trips (rule_high_value: amount > max(500, 5 × avg spend)).
const VICTIM_NAME = "Marcus Pillai";
const VICTIM_AVG = 380; // RM — their usual transaction size
const HIGH_VALUE_LINE = Math.max(500, VICTIM_AVG * 5); // = RM1,900

type Item = {
  id: string;
  emoji: string;
  name: string;
  merchant: string;
  location: string;
  mcc: string;
  online: boolean; // Mode: Online vs In-Person
  foreign: boolean; // out-of-country / cross-location
  price: number;
  image: string;
};

const ITEMS: Item[] = [
  {
    id: "coffee",
    emoji: "☕",
    name: "Flat White",
    merchant: "Starbucks",
    location: "Kuala Lumpur, MY",
    mcc: "5814",
    online: false,
    foreign: false,
    price: 18,
    image: "https://picsum.photos/seed/coffee/640/440",
  },
  {
    id: "sneakers",
    emoji: "👟",
    name: "Air Sneakers",
    merchant: "JD Sports",
    location: "Kuala Lumpur, MY",
    mcc: "5661",
    online: false,
    foreign: false,
    price: 450,
    image: "https://picsum.photos/seed/sneakers/640/440",
  },
  {
    id: "watch",
    emoji: "⌚",
    name: "Luxury Watch",
    merchant: "Rolex Boutique",
    location: "Dubai, UAE",
    mcc: "5944",
    online: false,
    foreign: true,
    price: 9500,
    image: "https://picsum.photos/seed/watch/640/440",
  },
  {
    id: "laptop",
    emoji: "💻",
    name: "Gaming Laptop",
    merchant: "Newegg (Online)",
    location: "California, US",
    mcc: "5732",
    online: true,
    foreign: true,
    price: 7000,
    image: "https://picsum.photos/seed/laptop/640/440",
  },
  {
    id: "flight",
    emoji: "✈️",
    name: "First-Class Flight",
    merchant: "Emirates (Online)",
    location: "Dubai, UAE",
    mcc: "4511",
    online: true,
    foreign: true,
    price: 25000,
    image: "https://picsum.photos/seed/flight/640/440",
  },
];

// PRE-TAP estimate only (mirrors rule_engine) so the meter feels alive. The real
// verdict comes from the backend after the physical tap.
function estimateRisk(item: Item, amount: number) {
  let ml = item.foreign ? 0.45 : 0.2;
  let rules = 0;
  if (amount > HIGH_VALUE_LINE) rules++;
  if (item.foreign) rules++;
  if (item.foreign && amount > 250) rules++;
  const score = Math.min(ml + Math.min(rules * 0.2, 0.5), 1);
  return { score, frozen: score >= 0.6 };
}

// Shape of the rows returned by GET /api/transactions.
type Txn = {
  transaction_id: string;
  amount_myr: number;
  fraud_score: number;
  predicted_label: string;
  risk_reasons: string[];
  card_frozen: boolean;
  card_frozen_reasons: string[];
  location: string;
};

type Phase = "browse" | "arm" | "waiting" | "result";

export default function ShopPage() {
  const [phase, setPhase] = useState<Phase>("browse");
  const [selected, setSelected] = useState<Item | null>(null);
  const [amount, setAmount] = useState(0);
  const [verdict, setVerdict] = useState<Txn | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [resetMsg, setResetMsg] = useState("");
  const seenRef = useRef<Set<string>>(new Set());

  const est = useMemo(
    () => (selected ? estimateRisk(selected, amount) : null),
    [selected, amount]
  );

  function choose(item: Item) {
    setSelected(item);
    setAmount(item.price);
    setTimedOut(false);
    setPhase("arm");
  }

  async function clearCart() {
    try {
      await fetch(`${API}/api/iot/cart`, { method: "DELETE" });
    } catch {
      /* booth offline — non-fatal */
    }
  }

  function reset() {
    clearCart();
    setSelected(null);
    setVerdict(null);
    setTimedOut(false);
    setPhase("browse");
  }

  // Operator-only: start a fresh run. Wipes the demo taps AND unfreezes the
  // victim's card (reset-demo-data). Note: that endpoint is local-only, so this
  // works when /shop is opened ON the booth machine (not via myfaid.com) — which
  // also stops random remote viewers from wiping the demo.
  async function resetDemo() {
    if (!window.confirm("Reset the demo? This clears all demo taps and unfreezes the card.")) {
      return;
    }
    setResetMsg("Resetting…");
    try {
      await fetch(`${API}/api/iot/cart`, { method: "DELETE" });
      const r = await fetch(`${API}/internal/reset-demo-data`, { method: "POST" });
      if (!r.ok) throw new Error(String(r.status));
      setResetMsg("Demo reset ✓");
    } catch {
      setResetMsg("Reset failed — run it on the booth machine (localhost).");
    }
    setSelected(null);
    setVerdict(null);
    setTimedOut(false);
    setPhase("browse");
    setTimeout(() => setResetMsg(""), 3500);
  }

  // Arm the cart, then wait for the physical tap to produce a new IOT txn.
  async function armAndWait() {
    if (!selected) return;
    // Prime the "seen" set so we only react to a genuinely new tap.
    try {
      const r = await fetch(`${API}/api/transactions?search=IOT&limit=50`);
      const d = await r.json();
      seenRef.current = new Set<string>(
        (d.transactions ?? []).map((t: Txn) => t.transaction_id)
      );
    } catch {
      seenRef.current = new Set();
    }
    try {
      await fetch(`${API}/api/iot/cart`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: selected.name,
          amount,
          merchant: selected.merchant,
          mcc: selected.mcc,
          location: selected.location,
          online: selected.online,
          foreign: selected.foreign,
        }),
      });
    } catch {
      /* non-fatal; the operator will see no verdict and can retry */
    }
    setTimedOut(false);
    setPhase("waiting");
  }

  // Poll for the verdict while waiting for the tap.
  useEffect(() => {
    if (phase !== "waiting") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const deadline = Date.now() + 25000;

    const tick = async () => {
      if (cancelled) return;
      try {
        const r = await fetch(`${API}/api/transactions?search=IOT&limit=6`);
        const d = await r.json();
        for (const t of (d.transactions ?? []) as Txn[]) {
          if (
            !seenRef.current.has(t.transaction_id) &&
            t.predicted_label &&
            t.predicted_label !== "pending"
          ) {
            if (cancelled) return;
            setVerdict(t);
            setPhase("result");
            return;
          }
        }
      } catch {
        /* keep polling */
      }
      if (Date.now() > deadline) {
        if (!cancelled) {
          setTimedOut(true);
          setPhase("arm");
          clearCart();
        }
        return;
      }
      timer = setTimeout(tick, 600);
    };
    timer = setTimeout(tick, 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Realistic behaviour: a frozen card declines everything. Once a fraud freezes
  // this victim, later taps read FROZEN until the operator hits Reset (which
  // wipes the demo taps and unfreezes the card for a fresh run).
  const frozen =
    !!verdict && (verdict.card_frozen || verdict.predicted_label === "FRAUD");
  const reasons = verdict
    ? verdict.card_frozen_reasons?.length
      ? verdict.card_frozen_reasons
      : verdict.risk_reasons ?? []
    : [];

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 via-gray-900 to-black text-white">
      <div className="mx-auto max-w-6xl px-5 py-8">
        {/* Header */}
        <div className="mb-8">
          <span className="inline-flex items-center gap-2 rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-red-300">
            ● Live fraud demo
          </span>
          <h1 className="mt-3 text-3xl font-bold sm:text-4xl">
            You&apos;ve got someone&apos;s card.{" "}
            <span className="text-red-400">Treat yourself.</span>
          </h1>
          <p className="mt-2 max-w-2xl text-gray-400">
            Pick something to buy with{" "}
            <span className="font-semibold text-gray-200">{VICTIM_NAME}</span>
            &apos;s stolen card, then tap it to pay. See how much you can get away
            with before we freeze it.
          </p>
        </div>

        {/* Item grid */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {ITEMS.map((item) => {
            const isSel = selected?.id === item.id;
            return (
              <button
                key={item.id}
                onClick={() => choose(item)}
                className={`group overflow-hidden rounded-2xl border text-left transition ${
                  isSel
                    ? "border-red-400 ring-2 ring-red-400/40"
                    : "border-white/10 hover:border-white/30"
                } bg-white/5`}
              >
                <div className="relative aspect-[4/3] overflow-hidden bg-gray-800">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.image}
                    alt={item.name}
                    className="h-full w-full object-cover opacity-90 transition group-hover:scale-105 group-hover:opacity-100"
                  />
                  <span className="absolute left-2 top-2 text-2xl drop-shadow">
                    {item.emoji}
                  </span>
                </div>
                <div className="p-3">
                  <div className="text-sm font-semibold">{item.name}</div>
                  <div className="text-xs text-gray-400">{item.merchant}</div>
                  <div className="mt-1 text-xs text-gray-500">
                    {item.foreign ? "🌍 " : "📍 "}
                    {item.location}
                  </div>
                  <div className="mt-2 text-base font-bold text-white">
                    RM{item.price.toLocaleString()}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Arm panel */}
        {selected && phase === "arm" && (
          <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-lg font-semibold">
                {selected.emoji} {selected.name}{" "}
                <span className="text-gray-400">· {selected.location}</span>
              </div>
              <button
                onClick={reset}
                className="text-sm text-gray-400 hover:text-white"
              >
                ✕ change
              </button>
            </div>

            {timedOut && (
              <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
                No tap detected. Make sure the bridge is running, then tap again.
              </div>
            )}

            {/* Amount slider */}
            <div className="mt-5">
              <div className="mb-1 flex items-baseline justify-between">
                <label className="text-sm text-gray-400">
                  How much do you want to get?
                </label>
                <span className="text-2xl font-bold">
                  RM{amount.toLocaleString()}
                </span>
              </div>
              <input
                type="range"
                min={5}
                max={30000}
                step={5}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="w-full accent-red-500"
              />
              <div className="mt-1 flex justify-between text-xs text-gray-500">
                <span>RM5</span>
                <span>
                  their usual ≈ RM{VICTIM_AVG} · freeze line ≈ RM
                  {HIGH_VALUE_LINE.toLocaleString()}
                </span>
                <span>RM30k</span>
              </div>
            </div>

            {/* Risk meter (estimate) */}
            {est && (
              <div className="mt-5">
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-gray-400">Estimated risk</span>
                  <span className={est.frozen ? "text-red-400" : "text-emerald-400"}>
                    {Math.round(est.score * 100)}%
                  </span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-white/10">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      est.frozen
                        ? "bg-gradient-to-r from-orange-500 to-red-500"
                        : "bg-gradient-to-r from-emerald-500 to-teal-400"
                    }`}
                    style={{ width: `${Math.max(est.score * 100, 4)}%` }}
                  />
                </div>
              </div>
            )}

            {/* Arm + tap prompt */}
            <button
              onClick={armAndWait}
              className="mt-6 w-full rounded-xl bg-red-500 py-4 text-lg font-bold text-white transition hover:bg-red-400 active:scale-[0.99]"
            >
              📲 Pay RM{amount.toLocaleString()} — tap your card
            </button>
          </div>
        )}
      </div>

      {/* Operator-only reset (discreet, bottom-left) */}
      <div className="fixed bottom-4 left-4 z-40 flex items-center gap-3">
        <button
          onClick={resetDemo}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-gray-400 hover:bg-white/10 hover:text-white"
        >
          ↺ Reset demo
        </button>
        {resetMsg && <span className="text-xs text-gray-400">{resetMsg}</span>}
      </div>

      {/* Waiting-for-tap overlay */}
      {phase === "waiting" && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-5 backdrop-blur-sm">
          <div className="text-center">
            <div className="relative mx-auto mb-8 h-28 w-28">
              <span className="absolute inset-0 animate-ping rounded-full bg-red-500/40" />
              <span className="absolute inset-0 flex items-center justify-center text-6xl">
                💳
              </span>
            </div>
            <div className="text-2xl font-bold">Tap your card now</div>
            <div className="mt-2 text-gray-400">
              Paying RM{amount.toLocaleString()} for {selected.name}
            </div>
            <button
              onClick={() => {
                clearCart();
                setPhase("arm");
              }}
              className="mt-8 rounded-lg bg-white/10 px-5 py-2 text-sm hover:bg-white/20"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Result overlay (REAL backend verdict) */}
      {phase === "result" && verdict && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-5 backdrop-blur-sm">
          <div
            className={`w-full max-w-md rounded-3xl border p-8 text-center ${
              frozen
                ? "border-red-500/40 bg-red-950/40"
                : "border-emerald-500/40 bg-emerald-950/30"
            }`}
          >
            <div className="text-6xl">{frozen ? "🚫" : "✅"}</div>
            <h2
              className={`mt-4 text-3xl font-extrabold ${
                frozen ? "text-red-400" : "text-emerald-400"
              }`}
            >
              {frozen ? "CARD FROZEN" : "Approved"}
            </h2>
            <p className="mt-2 text-gray-300">
              {frozen ? (
                verdict.predicted_label === "FRAUD" ? (
                  <>Nice try — caught and frozen. The real cardholder is safe.</>
                ) : (
                  <>This card was already blocked by an earlier fraud — declined.</>
                )
              ) : (
                <>RM{verdict.amount_myr.toLocaleString()} went through. Looked normal.</>
              )}
            </p>

            <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1 text-sm">
              fraud score{" "}
              <span className={frozen ? "font-bold text-red-300" : "font-bold text-emerald-300"}>
                {Math.round(verdict.fraud_score * 100)}%
              </span>
            </div>

            {frozen && reasons.length > 0 && (
              <ul className="mx-auto mt-5 space-y-1 text-left text-sm text-red-200">
                {reasons.map((r) => (
                  <li key={r} className="flex items-center gap-2">
                    <span className="text-red-400">▸</span> {r}
                  </li>
                ))}
              </ul>
            )}

            <button
              onClick={reset}
              className="mt-7 w-full rounded-xl bg-white/10 py-3 font-semibold hover:bg-white/20"
            >
              Try another
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
