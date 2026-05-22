"use client";

import { useState } from "react";
import type { TriggerStats } from "@/services/fraudApi";
import MlFeatureChart from "./MlFeatureChart";
import ModelPerformanceModal from "./ModelPerformanceModal";

interface MlSectionProps {
  ml: TriggerStats["ml"] | null;   // null while loading
}

const GROUP_LEGEND: { label: string; color: string }[] = [
  { label: "Velocity",    color: "#8b5cf6" },
  { label: "Engineered",  color: "#06b6d4" },
  { label: "Transaction", color: "#3b82f6" },
  { label: "Profile",     color: "#f59e0b" },
];

export default function MlSection({ ml }: MlSectionProps) {
  const [perfOpen, setPerfOpen] = useState(false);

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            Machine-Learning Model
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Unlike the rules, the model produces no single &quot;reason&quot; — it weighs dozens of
            signals into one fraud probability. Below are the signals it relies on most.
          </p>
        </div>
        <button
          onClick={() => setPerfOpen(true)}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3.5 py-2 text-sm font-medium text-brand-600 transition hover:bg-brand-100 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-400 dark:hover:bg-brand-500/20"
        >
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M4 13l3-3 3 2 5-6" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M3 17h14" strokeLinecap="round" />
          </svg>
          View performance
        </button>
      </div>

      <ModelPerformanceModal isOpen={perfOpen} onClose={() => setPerfOpen(false)} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Model identity + how it combines with rules */}
        <div className="flex flex-col gap-4 lg:col-span-1">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <span className="text-xs font-medium uppercase tracking-wide text-gray-400">Model</span>
            <p className="mt-1 text-lg font-semibold text-gray-800 dark:text-white/90">
              {ml?.model ?? "Random Forest"}
            </p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Trained on{" "}
              <span className="font-medium text-gray-700 dark:text-gray-300">
                {ml?.n_features ?? 93}
              </span>{" "}
              features. Outputs a fraud probability between 0 and 1.
            </p>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <span className="text-xs font-medium uppercase tracking-wide text-gray-400">
              How rules &amp; ML combine
            </span>
            <code className="mt-2 block rounded-lg bg-gray-50 px-3 py-2 text-xs leading-relaxed text-gray-600 dark:bg-white/[0.03] dark:text-gray-300">
              fraud_score = min( ML_prob + min(rules&times;0.2, 0.5), 1.0 )
            </code>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Each triggered rule adds <span className="font-medium">0.2</span> (capped at{" "}
              <span className="font-medium">0.5</span>) on top of the model score. A transaction is
              flagged <span className="font-medium text-error-500">FRAUD</span> when the combined
              score reaches <span className="font-medium">0.6</span>.
            </p>
          </div>
        </div>

        {/* Feature importance chart */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:col-span-2">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
              Top signals by model weight
            </h3>
            <div className="flex flex-wrap items-center gap-3">
              {GROUP_LEGEND.map((g) => (
                <span key={g.label} className="inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: g.color }} />
                  {g.label}
                </span>
              ))}
            </div>
          </div>

          {ml ? (
            <MlFeatureChart importances={ml.importances} />
          ) : (
            <div className="flex h-72 animate-pulse items-center justify-center rounded-lg bg-gray-50 text-sm text-gray-400 dark:bg-white/[0.03]">
              Loading feature importances…
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
