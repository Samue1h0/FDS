"use client";

import type { BlockchainNode, BlockchainNodes } from "@/services/fraudApi";

const STATUS_STYLE: Record<BlockchainNode["status"], { dot: string; label: string; text: string }> = {
  up:        { dot: "bg-success-500 animate-pulse", label: "Running",   text: "text-success-600 dark:text-success-400" },
  unhealthy: { dot: "bg-warning-500",               label: "Unhealthy", text: "text-warning-600 dark:text-warning-400" },
  down:      { dot: "bg-error-500",                 label: "Down",      text: "text-error-600 dark:text-error-400" },
};

function NodeCard({ node }: { node: BlockchainNode }) {
  const s = STATUS_STYLE[node.status];
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="mb-3 flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-800 dark:text-white/90">{node.name}</p>
          <span className="mt-0.5 inline-block rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:bg-white/[0.06] dark:text-gray-400">
            {node.role}
          </span>
        </div>
        <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${s.text}`}>
          <span className={`h-2 w-2 rounded-full ${s.dot}`} />
          {s.label}
        </span>
      </div>

      <dl className="space-y-1.5 text-xs">
        <div className="flex justify-between gap-2">
          <dt className="text-gray-400">MSP</dt>
          <dd className="font-medium text-gray-700 dark:text-gray-300">{node.msp}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-gray-400">Endpoint</dt>
          <dd className="truncate font-mono text-gray-600 dark:text-gray-400">{node.endpoint}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-gray-400">Block height</dt>
          <dd className="font-semibold text-gray-700 dark:text-gray-300">
            {node.block_height != null ? node.block_height.toLocaleString() : "—"}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-gray-400">Health latency</dt>
          <dd className="text-gray-600 dark:text-gray-400">
            {node.latency_ms != null ? `${node.latency_ms} ms` : "—"}
          </dd>
        </div>
      </dl>
    </div>
  );
}

export default function NetworkHealthCards({ data }: { data: BlockchainNodes | null }) {
  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Network health</h2>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            Live status of every node on the Hyperledger Fabric network.
          </p>
        </div>
        {data && (
          <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${
            data.all_healthy
              ? "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400"
              : "bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-400"
          }`}>
            <span className={`h-2 w-2 rounded-full ${data.all_healthy ? "bg-success-500 animate-pulse" : "bg-warning-500"}`} />
            {data.nodes_up}/{data.nodes_total} nodes up · gateway {data.gateway_ok ? "reachable" : "unreachable"}
          </span>
        )}
      </div>

      {!data ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-44 animate-pulse rounded-2xl bg-gray-100 dark:bg-white/[0.03]" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {data.nodes.map((n) => <NodeCard key={n.id} node={n} />)}
        </div>
      )}
    </section>
  );
}
