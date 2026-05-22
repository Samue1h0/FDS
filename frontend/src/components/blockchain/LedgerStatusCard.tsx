"use client";

import type { ChainState } from "@/services/fraudApi";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-800 dark:text-white/90">{value}</p>
    </div>
  );
}

export default function LedgerStatusCard({ chain }: { chain: ChainState | null }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <h3 className="mb-4 text-sm font-medium text-gray-500 dark:text-gray-400">Ledger status</h3>
      {!chain ? (
        <div className="space-y-3">
          <div className="h-8 w-32 animate-pulse rounded bg-gray-100 dark:bg-white/[0.05]" />
          <div className="h-4 w-48 animate-pulse rounded bg-gray-100 dark:bg-white/[0.05]" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4">
            <Stat label="Block height" value={chain.height.toLocaleString()} />
            <Stat label="Channel" value={chain.channel} />
          </div>
          <div className="mt-4 border-t border-gray-100 pt-4 dark:border-gray-800">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Latest block hash</p>
            <p className="mt-1 break-all font-mono text-xs text-gray-600 dark:text-gray-400">
              {chain.current_block_hash || "—"}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
