"use client";
import React from "react";
import Badge from "@/components/ui/badge/Badge";
import type { FrozenCard } from "@/services/fraudApi";

const formatMoney = (n: number) =>
  "RM " + n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatDate = (iso: string) =>
  iso
    ? new Date(iso).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" })
    : "—";

interface Props {
  cards: FrozenCard[];
  onSelect: (card: FrozenCard) => void;
}

const HEADERS = ["Customer", "Card", "Frozen On", "Frauds", "At Risk", "Txns"];

export default function FrozenCardsTable({ cards, onSelect }: Props) {
  if (cards.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-400 dark:border-gray-800 dark:bg-white/[0.03]">
        No frozen cards yet.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="max-w-full overflow-x-auto custom-scrollbar">
        <table className="min-w-full">
          <thead className="border-b border-gray-100 dark:border-gray-800">
            <tr>
              {HEADERS.map((h) => (
                <th
                  key={h}
                  className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {cards.map((c) => (
              <tr
                key={c.card_hash}
                onClick={() => onSelect(c)}
                className="cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.03]"
              >
                <td className="px-5 py-4 text-sm font-medium text-gray-800 dark:text-white/90">
                  {c.customer_ref}
                </td>
                <td className="px-5 py-4 text-sm text-gray-500 dark:text-gray-400">•••• {c.card_last4}</td>
                <td className="whitespace-nowrap px-5 py-4 text-sm text-gray-500 dark:text-gray-400">
                  {formatDate(c.frozen_at)}
                </td>
                <td className="px-5 py-4 text-sm">
                  <Badge color="error">{c.fraud_count}</Badge>
                </td>
                <td className="whitespace-nowrap px-5 py-4 text-sm font-medium text-gray-800 dark:text-white/90">
                  {formatMoney(c.amount_at_risk)}
                </td>
                <td className="px-5 py-4 text-sm text-gray-500 dark:text-gray-400">{c.total_txns}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
