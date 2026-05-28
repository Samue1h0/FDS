"use client";
import React from "react";
import Badge from "../ui/badge/Badge";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  DollarLineIcon,
  ListIcon,
  LockIcon,
  PaperPlaneIcon,
} from "@/icons";
import type { Stats } from "@/services/fraudApi";

interface FraudMetricsProps {
  stats: Stats | null;
}

// Compact MYR: 2613334.52 → "RM 2.6M"
const formatMYR = (n: number): string => {
  if (n >= 1e9) return `RM ${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `RM ${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `RM ${(n / 1e3).toFixed(1)}K`;
  return `RM ${n.toFixed(0)}`;
};

export const FraudMetrics = ({ stats }: FraudMetricsProps) => {
  const fraudCount = stats?.fraud_count ?? 0;
  const balanceAtRisk = stats?.balance_at_risk ?? 0;
  const compromisedCards = stats?.compromised_cards ?? 0;
  const pendingReview = stats?.pending_review ?? 0;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-4 md:gap-6 print:gap-2">
      {/* Flagged Transactions */}
      <div className="rounded-2xl border flex items-end justify-between mt-5 border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6 print:mt-0 print:p-3 break-avoid">
        <div className="flex items-end justify-between gap-6">
          <div className="flex items-center justify-center w-17 h-17 bg-gray-100 rounded-xl dark:bg-gray-800 print:hidden">
            <ListIcon className="text-gray-800 size-6 dark:text-white/90" />
          </div>
          <div>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Flagged Transactions
            </span>
            <h4 className="mt-2 font-bold text-gray-800 text-title-sm dark:text-white/90 print:mt-0 print:text-2xl whitespace-nowrap">
              {stats ? fraudCount.toLocaleString() : "—"}
            </h4>
          </div>
        </div>
        <Badge color="error" className="print:hidden">
          <ArrowUpIcon />
          Fraud
        </Badge>
      </div>

      {/* Balance at Risk */}
      <div className="rounded-2xl border flex items-end justify-between mt-5 border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6 print:mt-0 print:p-3 break-avoid">
        <div className="flex items-end justify-between gap-6">
          <div className="flex items-center justify-center w-17 h-17 bg-gray-100 rounded-xl dark:bg-gray-800 print:hidden">
            <DollarLineIcon className="text-gray-800 size-6 dark:text-white/90" />
          </div>
          <div>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Balance at Risk
            </span>
            <h4 className="mt-2 font-bold text-gray-800 text-title-sm dark:text-white/90 print:mt-0 print:text-2xl whitespace-nowrap">
              {stats ? formatMYR(balanceAtRisk) : "—"}
            </h4>
          </div>
        </div>
        <Badge color="error" className="print:hidden">
          <ArrowUpIcon className="text-error-500" />
          At Risk
        </Badge>
      </div>

      {/* Compromised Cards */}
      <div className="rounded-2xl border flex items-end justify-between mt-5 border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6 print:mt-0 print:p-3 break-avoid">
        <div className="flex items-end justify-between gap-6">
          <div className="flex items-center justify-center w-17 h-17 bg-gray-100 rounded-xl dark:bg-gray-800 print:hidden">
            <LockIcon className="text-gray-800 size-6 dark:text-white/90" />
          </div>
          <div>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Compromised Cards
            </span>
            <h4 className="mt-2 font-bold text-gray-800 text-title-sm dark:text-white/90 print:mt-0 print:text-2xl whitespace-nowrap">
              {stats ? compromisedCards.toLocaleString() : "—"}
            </h4>
          </div>
        </div>
        <Badge color={compromisedCards > 0 ? "error" : "success"} className="print:hidden">
          <ArrowUpIcon className="text-error-500" />
          Frozen
        </Badge>
      </div>

      {/* Pending Review */}
      <div className="rounded-2xl border flex items-end justify-between mt-5 border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6 print:mt-0 print:p-3 break-avoid">
        <div className="flex items-end justify-between gap-6">
          <div className="flex items-center justify-center w-17 h-17 bg-gray-100 rounded-xl dark:bg-gray-800 print:hidden">
            <PaperPlaneIcon className="text-gray-800 dark:text-white/90" />
          </div>
          <div>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Pending Review
            </span>
            <h4 className="mt-2 font-bold text-gray-800 text-title-sm dark:text-white/90 print:mt-0 print:text-2xl whitespace-nowrap">
              {stats ? pendingReview.toLocaleString() : "—"}
            </h4>
          </div>
        </div>
        <Badge color={pendingReview > 0 ? "error" : "success"} className="print:hidden">
          {pendingReview > 0 ? <ArrowUpIcon className="text-error-500" /> : <ArrowDownIcon />}
          {pendingReview > 0 ? "Pending" : "Clear"}
        </Badge>
      </div>
    </div>
  );
};
