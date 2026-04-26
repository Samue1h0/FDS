"use client";
import React from "react";
import Badge from "../ui/badge/Badge";
import {
  AlertIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  ListIcon,
  PaperPlaneIcon,
} from "@/icons";
import type { Stats } from "@/services/fraudApi";

interface FraudMetricsProps {
  stats: Stats | null;
}

export const FraudMetrics = ({ stats }: FraudMetricsProps) => {
  const fraudCount = stats?.fraud_count ?? 0;
  const legitCount = stats?.legit_count ?? 0;
  const pendingReview = stats?.pending_review ?? 0;
  const avgScore = stats?.avg_fraud_score ?? 0;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-4 md:gap-6">
      {/* Flagged Transactions */}
      <div className="rounded-2xl border flex items-end justify-between mt-5 border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
        <div className="flex items-end justify-between gap-6">
          <div className="flex items-center justify-center w-17 h-17 bg-gray-100 rounded-xl dark:bg-gray-800">
            <ListIcon className="text-gray-800 size-6 dark:text-white/90" />
          </div>
          <div>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Flagged Transactions
            </span>
            <h4 className="mt-2 font-bold text-gray-800 text-title-sm dark:text-white/90">
              {stats ? fraudCount.toLocaleString() : "—"}
            </h4>
          </div>
        </div>
        <Badge color="error">
          <ArrowUpIcon />
          Fraud
        </Badge>
      </div>

      {/* Legit Transactions */}
      <div className="rounded-2xl border flex items-end justify-between mt-5 border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
        <div>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Legit Transactions
          </span>
          <h4 className="mt-2 font-bold text-gray-800 text-title-sm dark:text-white/90">
            {stats ? legitCount.toLocaleString() : "—"}
          </h4>
        </div>
        <Badge color="success">
          <ArrowUpIcon />
          Legit
        </Badge>
      </div>

      {/* Avg Fraud Score */}
      <div className="rounded-2xl border flex items-end justify-between mt-5 border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
        <div className="flex items-end justify-between gap-6">
          <div className="flex items-center justify-center w-17 h-17 bg-gray-100 rounded-xl dark:bg-gray-800">
            <AlertIcon className="text-gray-800 dark:text-white/90" />
          </div>
          <div>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Avg Fraud Score
            </span>
            <h4 className="mt-2 font-bold text-gray-800 text-title-sm dark:text-white/90">
              {stats ? (avgScore * 100).toFixed(1) + "%" : "—"}
            </h4>
          </div>
        </div>
        <Badge color={avgScore > 0.5 ? "error" : "warning"}>
          <ArrowUpIcon className="text-error-500" />
          Score
        </Badge>
      </div>

      {/* Pending Review */}
      <div className="rounded-2xl border flex items-end justify-between mt-5 border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
        <div className="flex items-end justify-between gap-6">
          <div className="flex items-center justify-center w-17 h-17 bg-gray-100 rounded-xl dark:bg-gray-800">
            <PaperPlaneIcon className="text-gray-800 dark:text-white/90" />
          </div>
          <div>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Pending Review
            </span>
            <h4 className="mt-2 font-bold text-gray-800 text-title-sm dark:text-white/90">
              {stats ? pendingReview.toLocaleString() : "—"}
            </h4>
          </div>
        </div>
        <Badge color={pendingReview > 0 ? "error" : "success"}>
          {pendingReview > 0 ? <ArrowUpIcon className="text-error-500" /> : <ArrowDownIcon />}
          {pendingReview > 0 ? "Pending" : "Clear"}
        </Badge>
      </div>
    </div>
  );
};
