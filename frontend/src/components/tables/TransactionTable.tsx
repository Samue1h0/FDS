"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "../ui/table";
import Badge from "../ui/badge/Badge";
import Pagination from "./Pagination";
import { getTransactions, type Transaction, type TransactionFilters } from "@/services/fraudApi";
import ExportModal from "./ExportModal";
import ReviewModal from "../dashboard/ReviewModal";

const PAGE_SIZE = 10;

type DecisionFilter = "ALL" | "FRAUD" | "LEGIT";
type StatusFilter  = "ALL" | "PENDING" | "REVIEWED";
type RiskFilter    = "ALL" | "LOW" | "MEDIUM" | "HIGH";

function getRisk(score: number): { label: "Low" | "Medium" | "High"; color: "success" | "warning" | "error" } {
  if (score >= 0.8) return { label: "High",   color: "error"   };
  if (score >= 0.6) return { label: "Medium", color: "warning" };
  return                    { label: "Low",    color: "success" };
}

// Sort field keys mirror the backend whitelist (api.py _SORT_COLUMNS).
type SortField =
  | "transaction_id" | "timestamp" | "customer_ref" | "merchant_name"
  | "amount_myr" | "fraud_score" | "predicted_label";
type SortDir = "asc" | "desc";

const NUMERIC_FIELDS = new Set<SortField>(["amount_myr", "fraud_score"]);
// Fields where the first click should sort high→low / newest→oldest.
const DEFAULT_DESC = new Set<SortField>(["timestamp", "amount_myr", "fraud_score"]);

// Column layout; `field` marks the sortable ones (label drives the header).
const COLUMNS: { label: string; field?: SortField }[] = [
  { label: "Transaction ID", field: "transaction_id" },
  { label: "Date",           field: "timestamp" },
  { label: "Customer",       field: "customer_ref" },
  { label: "Merchant",       field: "merchant_name" },
  { label: "Card" },
  { label: "Amount (MYR)",   field: "amount_myr" },
  { label: "Risk",           field: "fraud_score" },
  { label: "Decision",       field: "predicted_label" },
  { label: "Status" },
  { label: "Action" },
];

function sortTxns(rows: Transaction[], field: SortField, dir: SortDir): Transaction[] {
  const mul = dir === "asc" ? 1 : -1;
  const val = (t: Transaction) => t[field] as string | number;
  return [...rows].sort((a, b) => {
    const av = val(a), bv = val(b);
    const cmp = NUMERIC_FIELDS.has(field)
      ? (av as number) - (bv as number)
      : String(av).localeCompare(String(bv));
    // Stable tiebreaker (transaction_id ASC) — matches the export's ORDER BY.
    return cmp !== 0 ? cmp * mul : a.transaction_id.localeCompare(b.transaction_id);
  });
}

function formatDate(ts: string) {
  try {
    return new Date(ts).toLocaleString("en-MY", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return ts;
  }
}

function FilterBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
        active
          ? "bg-brand-500 text-white"
          : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5"
      }`}
    >
      {children}
    </button>
  );
}

export default function TransactionTable() {
  const searchParams = useSearchParams();
  const urlRisk      = searchParams.get("risk")?.toUpperCase();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [decision,     setDecision]     = useState<DecisionFilter>("ALL");
  const [status,       setStatus]       = useState<StatusFilter>("ALL");
  const [risk,         setRisk]         = useState<RiskFilter>(
    (urlRisk === "LOW" || urlRisk === "MEDIUM" || urlRisk === "HIGH") ? urlRisk as RiskFilter : "ALL"
  );
  const [searchInput,  setSearchInput]  = useState("");
  const [search,       setSearch]       = useState("");
  const [currentPage,  setCurrentPage]  = useState(1);
  const [sortField,    setSortField]    = useState<SortField>("timestamp");
  const [sortDir,      setSortDir]       = useState<SortDir>("desc");
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
  const [selected,     setSelected]     = useState<Transaction | null>(null);
  const [modalOpen,       setModalOpen]       = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getTransactions({
        decision: decision !== "ALL" ? decision : undefined,
        reviewed: status === "ALL" ? undefined : status === "REVIEWED",
        search:   search || undefined,
        risk:     risk !== "ALL" ? risk : undefined,
        limit:    100000,
      });
      setTransactions(res.transactions);
    } catch {
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  }, [decision, status, search, risk]);

  useEffect(() => { fetchTransactions(); }, [fetchTransactions]);

  // reset to page 1 whenever any filter or the sort changes
  useEffect(() => { setCurrentPage(1); }, [decision, status, risk, search, sortField, sortDir, selectedCustomers]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(DEFAULT_DESC.has(field) ? "desc" : "asc");
    }
  };

  const visible = useMemo(() => {
    const filtered = selectedCustomers.length
      ? transactions.filter((t) => selectedCustomers.includes(t.customer_ref))
      : transactions;
    return sortTxns(filtered, sortField, sortDir);
  }, [transactions, sortField, sortDir, selectedCustomers]);

  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const paginated  = visible.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const handleReview = (txn: Transaction) => {
    setSelected(txn);
    setModalOpen(true);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
  };

  // Active filters in the shape the export endpoint expects (passed to the modal).
  const currentFilters: TransactionFilters = {
    decision: decision !== "ALL" ? decision : undefined,
    reviewed: status === "ALL" ? undefined : status === "REVIEWED",
    search:   search || undefined,
    risk:     risk !== "ALL" ? risk : undefined,
  };

  return (
    <>
      {/* ── Filters ──────────────────────────────────────────────────────── */}
      <div className="mb-4 flex flex-wrap gap-3 items-center">

        {/* Search */}
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            placeholder="Search ID, merchant, customer…"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:placeholder:text-gray-600 w-64"
          />
          <button
            type="submit"
            className="px-3 py-1.5 rounded-lg bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition-colors"
          >
            Search
          </button>
          {search && (
            <button
              type="button"
              onClick={() => { setSearch(""); setSearchInput(""); }}
              className="px-3 py-1.5 rounded-lg text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
            >
              Clear
            </button>
          )}
        </form>

        {/* Decision */}
        <div className="flex gap-1 rounded-xl bg-gray-100 p-1 dark:bg-gray-800">
          {(["ALL", "FRAUD", "LEGIT"] as DecisionFilter[]).map(d => (
            <FilterBtn key={d} active={decision === d} onClick={() => setDecision(d)}>
              {d === "ALL" ? "All" : d}
            </FilterBtn>
          ))}
        </div>

        {/* Review status */}
        <div className="flex gap-1 rounded-xl bg-gray-100 p-1 dark:bg-gray-800">
          {(["ALL", "PENDING", "REVIEWED"] as StatusFilter[]).map(s => (
            <FilterBtn key={s} active={status === s} onClick={() => setStatus(s)}>
              {s === "ALL" ? "All Status" : s === "PENDING" ? "Pending" : "Reviewed"}
            </FilterBtn>
          ))}
        </div>

        {/* Risk level */}
        <div className="flex gap-1 rounded-xl bg-gray-100 p-1 dark:bg-gray-800">
          {(["ALL", "LOW", "MEDIUM", "HIGH"] as RiskFilter[]).map(r => (
            <FilterBtn key={r} active={risk === r} onClick={() => setRisk(r)}>
              {r === "ALL" ? "All Risk" : r.charAt(0) + r.slice(1).toLowerCase()}
            </FilterBtn>
          ))}
        </div>

        {/* Result count + export */}
        <div className="ml-auto flex items-center gap-3">
          {!loading && (
            <span className="text-sm text-gray-400 dark:text-gray-500">
              {visible.length} result{visible.length !== 1 ? "s" : ""}
            </span>
          )}
          <button
            type="button"
            onClick={() => setExportModalOpen(true)}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/5"
          >
            Export
          </button>
        </div>
      </div>

      {/* Active customer filter (set via the Export → Customers panel) */}
      {selectedCustomers.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-gray-400">Customers:</span>
          {selectedCustomers.map((ref) => (
            <span
              key={ref}
              className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-600 dark:bg-brand-500/15 dark:text-brand-400"
            >
              {ref}
              <button
                type="button"
                onClick={() => setSelectedCustomers((prev) => prev.filter((r) => r !== ref))}
                className="hover:text-brand-800 dark:hover:text-brand-200"
              >
                ×
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={() => setSelectedCustomers([])}
            className="text-xs font-medium text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            Clear
          </button>
        </div>
      )}

      {/* ── Table ────────────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
        <div className="max-w-full overflow-x-auto">
          <div className="min-w-[1100px]">
            <Table>
              <TableHeader className="border-b border-gray-100 dark:border-white/[0.05]">
                <TableRow>
                  {COLUMNS.map((col) => {
                    const active = !!col.field && sortField === col.field;
                    return (
                      <TableCell
                        key={col.label}
                        isHeader
                        className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                      >
                        {col.field ? (
                          <button
                            type="button"
                            onClick={() => handleSort(col.field!)}
                            className={`group inline-flex items-center gap-1 transition-colors hover:text-gray-700 dark:hover:text-gray-200 ${
                              active ? "text-gray-700 dark:text-gray-200" : ""
                            }`}
                          >
                            {col.label}
                            <span className="text-[10px] leading-none">
                              {active ? (
                                sortDir === "asc" ? "▲" : "▼"
                              ) : (
                                <span className="opacity-0 transition-opacity group-hover:opacity-40">▼</span>
                              )}
                            </span>
                          </button>
                        ) : (
                          col.label
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              </TableHeader>

              <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={10} className="py-10 text-center text-sm text-gray-400">
                      Loading transactions…
                    </TableCell>
                  </TableRow>
                ) : visible.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="py-10 text-center text-sm text-gray-400">
                      No transactions found
                    </TableCell>
                  </TableRow>
                ) : (
                  paginated.map(txn => {
                    const riskInfo  = getRisk(txn.fraud_score);
                    const reviewed  = !!(txn.reviewed_by && txn.reviewed_by !== "");
                    const decColor  = txn.predicted_label === "FRAUD" ? "error" : txn.predicted_label === "LEGIT" ? "success" : "light";
                    const postFreeze = !!(txn.card_frozen && txn.card_frozen_at && new Date(txn.timestamp) > new Date(txn.card_frozen_at));

                    return (
                      <TableRow key={txn.transaction_id}>
                        <TableCell className="px-5 py-3 text-theme-sm text-gray-500 dark:text-gray-400 font-mono">
                          {txn.transaction_id.length > 14
                            ? `${txn.transaction_id.slice(0, 14)}…`
                            : txn.transaction_id}
                        </TableCell>
                        <TableCell className="px-5 py-3 text-theme-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                          {formatDate(txn.timestamp)}
                        </TableCell>
                        <TableCell className="px-5 py-3 text-theme-sm text-gray-500 dark:text-gray-400">
                          {txn.customer_ref}
                        </TableCell>
                        <TableCell className="px-5 py-3 text-theme-sm text-gray-500 dark:text-gray-400">
                          {txn.merchant_name}
                        </TableCell>
                        <TableCell className="px-5 py-3 text-theme-sm text-gray-500 dark:text-gray-400 font-mono">
                          <div className="flex flex-col gap-1">
                            <span>{txn.masked_card_number}</span>
                            {txn.card_frozen && (
                              <span className="inline-flex w-fit items-center rounded-full bg-error-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-error-600 dark:bg-error-500/15 dark:text-error-500">
                                {postFreeze ? "Post-freeze" : "Frozen"}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="px-5 py-3 text-theme-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                          RM {txn.amount_myr.toLocaleString("en-MY", { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="px-5 py-3">
                          <Badge size="sm" color={riskInfo.color}>{riskInfo.label}</Badge>
                        </TableCell>
                        <TableCell className="px-5 py-3">
                          <Badge size="sm" color={decColor}>{txn.predicted_label}</Badge>
                        </TableCell>
                        <TableCell className="px-5 py-3">
                          <Badge size="sm" color={reviewed ? "success" : "warning"}>
                            {reviewed ? "Reviewed" : "Pending"}
                          </Badge>
                        </TableCell>
                        <TableCell className="px-5 py-3">
                          {reviewed ? (
                            <span className="text-xs text-gray-400 dark:text-gray-600">—</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleReview(txn)}
                              className="rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-600 hover:bg-brand-100 dark:bg-brand-500/10 dark:text-brand-400 dark:hover:bg-brand-500/20 transition-colors"
                            >
                              Review
                            </button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      {/* ── Pagination ───────────────────────────────────────────────────── */}
      {!loading && visible.length > 0 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Showing{" "}
            <span className="font-medium text-gray-700 dark:text-gray-300">
              {(currentPage - 1) * PAGE_SIZE + 1}
            </span>
            {" – "}
            <span className="font-medium text-gray-700 dark:text-gray-300">
              {Math.min(currentPage * PAGE_SIZE, visible.length)}
            </span>
            {" of "}
            <span className="font-medium text-gray-700 dark:text-gray-300">
              {visible.length}
            </span>
          </p>
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
          />
        </div>
      )}

      <ReviewModal
        transaction={selected}
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={() => { setModalOpen(false); fetchTransactions(); }}
      />

      <ExportModal
        isOpen={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        currentFilters={currentFilters}
        sort={sortField}
        order={sortDir}
        selectedCustomers={selectedCustomers}
        onCustomersChange={setSelectedCustomers}
      />
    </>
  );
}
