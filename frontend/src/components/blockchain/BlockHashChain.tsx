"use client";

import type { ChainState } from "@/services/fraudApi";

const short = (hash: string) =>
  hash && hash.length > 16 ? `${hash.slice(0, 10)}…${hash.slice(-6)}` : hash || "—";

/** A single block tile in the chain. */
function BlockTile({ number, dataHash, txCount, isTip }: {
  number: number; dataHash: string; txCount: number; isTip: boolean;
}) {
  return (
    <div className={`shrink-0 rounded-xl border p-4 ${
      isTip
        ? "border-brand-300 bg-brand-50 dark:border-brand-500/40 dark:bg-brand-500/10"
        : "border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
    }`}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold text-gray-800 dark:text-white/90">Block #{number}</span>
        {isTip && (
          <span className="rounded-full bg-brand-500 px-2 py-0.5 text-[10px] font-medium text-white">TIP</span>
        )}
      </div>
      <p className="mt-2 text-[10px] uppercase tracking-wide text-gray-400">Data hash</p>
      <p className="font-mono text-xs text-gray-600 dark:text-gray-400">{short(dataHash)}</p>
      <p className="mt-2 text-[11px] text-gray-400">{txCount} tx{txCount === 1 ? "" : "s"}</p>
    </div>
  );
}

/** Arrow showing each block references the previous block's hash. */
function ChainLink() {
  return (
    <div className="flex shrink-0 flex-col items-center justify-center px-1 text-gray-300 dark:text-gray-600">
      <span className="text-[9px] uppercase tracking-wide text-gray-400">prev&nbsp;hash</span>
      <svg className="h-5 w-8" viewBox="0 0 32 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M2 10h26m0 0l-6-5m6 5l-6 5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export default function BlockHashChain({ chain }: { chain: ChainState | null }) {
  return (
    <section>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Immutable hash chain</h2>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
          Each block cryptographically references the previous block&apos;s hash. Altering any past
          record would break every hash after it — the network would reject it instantly.
        </p>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
        {!chain ? (
          <div className="flex gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-28 w-44 shrink-0 animate-pulse rounded-xl bg-gray-100 dark:bg-white/[0.05]" />
            ))}
          </div>
        ) : chain.blocks.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No blocks committed yet.</p>
        ) : (
          <div className="flex items-stretch gap-2 overflow-x-auto pb-2">
            {chain.blocks.map((b, i) => (
              <div key={b.number} className="flex items-stretch">
                <BlockTile
                  number={b.number}
                  dataHash={b.data_hash}
                  txCount={b.tx_count}
                  isTip={i === 0}
                />
                {i < chain.blocks.length - 1 && <ChainLink />}
              </div>
            ))}
          </div>
        )}
        {chain && chain.blocks.length > 0 && (
          <p className="mt-3 text-xs text-gray-400">
            Showing the {chain.blocks.length} most recent blocks (newest first), from a chain of{" "}
            {chain.height.toLocaleString()}.
          </p>
        )}
      </div>
    </section>
  );
}
