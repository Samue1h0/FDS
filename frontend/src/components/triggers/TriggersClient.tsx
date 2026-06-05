"use client";

import { useEffect, useState } from "react";
import { getTriggerStats, type TriggerStats } from "@/services/fraudApi";
import { useLive } from "@/context/LiveContext";
import RuleEngineSection from "./RuleEngineSection";
import MlSection from "./MlSection";

export default function TriggersClient() {
  const [stats, setStats] = useState<TriggerStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Re-pull the trigger stats whenever the live feed reports new data.
  const { lastUpdated } = useLive();

  useEffect(() => {
    let active = true;
    getTriggerStats()
      .then((data) => { if (active) setStats(data); })
      .catch((e) => { if (active) setError(e instanceof Error ? e.message : "Failed to load trigger stats"); });
    return () => { active = false; };
  }, [lastUpdated]);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white/90 sm:text-3xl">
          Detection Triggers
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
          Every verdict comes from two layers working together: an explicit{" "}
          <span className="font-medium text-gray-700 dark:text-gray-300">rule engine</span> and a{" "}
          <span className="font-medium text-gray-700 dark:text-gray-300">machine-learning model</span>.
          {stats && (
            <> These counts reflect{" "}
              <span className="font-medium text-gray-700 dark:text-gray-300">
                {stats.total_transactions.toLocaleString()}
              </span>{" "}
              scored transactions.
            </>
          )}
        </p>
      </header>

      {error && (
        <p className="rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400">
          {error}
        </p>
      )}

      <RuleEngineSection ruleCounts={stats?.rule_counts ?? null} />
      <MlSection ml={stats?.ml ?? null} />
    </div>
  );
}
