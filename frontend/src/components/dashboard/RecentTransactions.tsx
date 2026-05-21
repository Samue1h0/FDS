import Link from "next/link";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "../ui/table";
import Badge from "../ui/badge/Badge";
import type { Transaction } from "@/services/fraudApi";

interface RecentTransactionsProps {
  transactions: Transaction[];
}

function getRiskLevel(score: number): { label: string; color: "error" | "warning" | "success" } {
  if (score >= 0.8) return { label: "High", color: "error" };
  if (score >= 0.6) return { label: "Medium", color: "warning" };
  return { label: "Low", color: "success" };
}

function getStatusInfo(txn: Transaction): {
  label: "Pending" | "In Review" | "Resolved";
  color: "error" | "warning" | "success";
} {
  if (txn.reviewed_by && txn.reviewed_by !== "") return { label: "Resolved", color: "success" };
  if (txn.predicted_label === "FRAUD") return { label: "Pending", color: "error" };
  return { label: "In Review", color: "warning" };
}

function formatDateTime(timestamp: string): string {
  try {
    const dt = new Date(timestamp);
    return dt.toLocaleString("en-MY", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return timestamp;
  }
}

export default function RecentTransactions({ transactions }: RecentTransactionsProps) {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white px-4 pb-3 pt-4 dark:border-gray-800 dark:bg-white/[0.03] sm:px-6 h-full">
      <div className="flex flex-col gap-2 mb-4 sm:flex-row sm:items-center sm:justify-between shrink-0">
        <div>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">Recent Transactions</h3>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/basic-tables"
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-theme-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 hover:text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.03] dark:hover:text-gray-200"
          >
            See all
          </Link>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto custom-scrollbar">
        <Table>
          <TableHeader className="border-gray-100 dark:border-gray-800 border-y">
            <TableRow>
              <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">Customer</TableCell>
              <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">Merchant</TableCell>
              <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">Amount (MYR)</TableCell>
              <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">Risk</TableCell>
              <TableCell isHeader className="py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">Status</TableCell>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-gray-100 dark:divide-gray-800">
            {transactions.length === 0 ? (
              <TableRow>
                <TableCell className="py-6 text-center text-gray-400 text-theme-sm" colSpan={5}>
                  No transactions found
                </TableCell>
              </TableRow>
            ) : (
              transactions.map((txn) => {
                const risk = getRiskLevel(txn.fraud_score);
                const status = getStatusInfo(txn);
                return (
                  <TableRow key={txn.transaction_id}>
                    <TableCell className="py-3">
                      <div>
                        <p className="font-medium text-gray-800 text-theme-sm dark:text-white/90">{txn.customer_ref}</p>
                        <span className="text-gray-500 text-theme-xs dark:text-gray-400">{formatDateTime(txn.timestamp)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-3 text-gray-500 text-theme-sm dark:text-gray-400">{txn.merchant_name}</TableCell>
                    <TableCell className="py-3 text-gray-500 text-theme-sm dark:text-gray-400">
                      RM{txn.amount_myr.toLocaleString("en-MY", { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="py-3">
                      <Badge size="sm" color={risk.color}>{risk.label}</Badge>
                    </TableCell>
                    <TableCell className="py-3">
                      <Badge size="sm" color={status.color}>{status.label}</Badge>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
