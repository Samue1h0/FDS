"use client";

import { useEffect, useState } from "react";
import {
  getBlockchainNodes,
  getChainState,
  type BlockchainNodes,
  type ChainState,
} from "@/services/fraudApi";
import { useLive } from "@/context/LiveContext";
import NetworkHealthCards from "./NetworkHealthCards";
import LedgerStatusCard from "./LedgerStatusCard";
import BlockHashChain from "./BlockHashChain";
import IntegrityPanel from "./IntegrityPanel";
import TxHistoryInspector from "./TxHistoryInspector";

export default function BlockchainClient() {
  const [nodes, setNodes] = useState<BlockchainNodes | null>(null);
  const [chain, setChain] = useState<ChainState | null>(null);
  const [error, setError] = useState<string | null>(null);

  // A new scored txn bumps lastUpdated; re-pull promptly so the block height /
  // hash chain catch up without waiting for the next poll tick. (The block
  // itself commits a beat after the SSE event, so the intervals below still
  // backstop the eventual commit.)
  const { lastUpdated } = useLive();

  // Network health — poll every 10s for live up/down + climbing block height.
  useEffect(() => {
    let active = true;
    const load = () =>
      getBlockchainNodes()
        .then((d) => { if (active) { setNodes(d); setError(null); } })
        .catch((e) => { if (active) setError(e instanceof Error ? e.message : "Failed to reach backend"); });
    load();
    const id = setInterval(load, 10_000);
    return () => { active = false; clearInterval(id); };
  }, [lastUpdated]);

  // Hash chain — poll a little slower; it only changes when a block commits.
  useEffect(() => {
    let active = true;
    const load = () =>
      getChainState(8)
        .then((d) => { if (active) setChain(d); })
        .catch(() => { /* surfaced via the nodes error banner */ });
    load();
    const id = setInterval(load, 15_000);
    return () => { active = false; clearInterval(id); };
  }, [lastUpdated]);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white/90 sm:text-3xl">Blockchain</h1>
        <p className="mt-2 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
          Every fraud decision is committed to a Hyperledger Fabric ledger. This page shows the
          network running live, the immutable hash chain, and continuous proof that no record has
          been tampered with.
        </p>
      </header>

      {error && (
        <p className="rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400">
          {error} — is the backend and Fabric gateway running?
        </p>
      )}

      <NetworkHealthCards data={nodes} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-1"><LedgerStatusCard chain={chain} /></div>
        <div className="lg:col-span-2"><IntegrityPanel /></div>
      </div>

      <BlockHashChain chain={chain} />

      <TxHistoryInspector />
    </div>
  );
}
