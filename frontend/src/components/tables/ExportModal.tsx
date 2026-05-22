"use client";

import { useCallback, useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { useAuth } from "@/context/AuthContext";
import { exportTransactions, getExportMeta, type TransactionFilters } from "@/services/fraudApi";
import FlatpickrInput from "@/components/form/FlatpickrInput";
import CustomerFilterPanel from "./CustomerFilterPanel";

// Keys must match the backend export column registry (api.py _EXPORT_COLUMNS).
const EXPORT_COLUMNS: { key: string; label: string }[] = [
  { key: "transaction_id",  label: "Transaction ID" },
  { key: "timestamp",       label: "Timestamp" },
  { key: "customer_ref",    label: "Customer Ref" },
  { key: "masked_card",     label: "Masked Card" },
  { key: "merchant",        label: "Merchant" },
  { key: "mcc",             label: "MCC" },
  { key: "mode",            label: "Mode" },
  { key: "location",        label: "Location" },
  { key: "amount",          label: "Amount (MYR)" },
  { key: "fraud_score",     label: "Fraud Score" },
  { key: "risk_level",      label: "Risk Level" },
  { key: "decision",        label: "Decision" },
  { key: "ml_prediction",   label: "ML Prediction" },
  { key: "rule_flag",       label: "Rule Flag" },
  { key: "rules_triggered", label: "Rules Triggered" },
  { key: "ground_truth",    label: "Ground Truth" },
  { key: "reviewed_by",     label: "Reviewed By" },
  { key: "reviewed_at",     label: "Reviewed At" },
];
const PII_COLUMNS: { key: string; label: string }[] = [
  { key: "cardholder_name", label: "Cardholder Name" },
  { key: "ic_number",       label: "IC Number" },
  { key: "card_number",     label: "Card Number" },
  { key: "card_expiration", label: "Card Expiration" },
];
const PII_KEYS  = PII_COLUMNS.map((c) => c.key);
const PII_ROLES = ["analyst", "admin"];

// Sortable fields — keys must match the backend whitelist (api.py _SORT_COLUMNS).
const SORT_OPTIONS: { key: string; label: string }[] = [
  { key: "timestamp",       label: "Time" },
  { key: "transaction_id",  label: "Transaction ID" },
  { key: "customer_ref",    label: "Customer" },
  { key: "merchant_name",   label: "Merchant" },
  { key: "amount_myr",      label: "Amount" },
  { key: "fraud_score",     label: "Fraud score" },
  { key: "predicted_label", label: "Decision" },
  { key: "reviewed_at",     label: "Reviewed date" },
];

type Decision = "ALL" | "FRAUD" | "LEGIT";
type Status   = "ALL" | "PENDING" | "REVIEWED";
type Risk     = "ALL" | "LOW" | "MEDIUM" | "HIGH";

interface ExportModalProps {
  isOpen:            boolean;
  onClose:           () => void;
  currentFilters:    TransactionFilters;   // seeds the modal's filters from the table
  sort?:             string;               // table's current sort field (export follows it)
  order?:            "asc" | "desc";       // table's current sort direction
  selectedCustomers: string[];             // customer_refs (shared with the table filter)
  onCustomersChange: (refs: string[]) => void;
}

export default function ExportModal({
  isOpen, onClose, currentFilters, sort, order, selectedCustomers, onCustomersChange,
}: ExportModalProps) {
  const { user } = useAuth();
  const canExportPii = !!user?.role && PII_ROLES.includes(user.role);

  // Filters (own copy, seeded from the table on open)
  const [decision, setDecision] = useState<Decision>("ALL");
  const [status,   setStatus]   = useState<Status>("ALL");
  const [risk,     setRisk]     = useState<Risk>("ALL");

  const [format,     setFormat]     = useState<"csv" | "xlsx">("csv");
  const [sortField,  setSortField]  = useState<string>("timestamp");
  const [sortDir,    setSortDir]    = useState<"asc" | "desc">("desc");
  const [selected,   setSelected]   = useState<string[]>(EXPORT_COLUMNS.map((c) => c.key));
  const [includePii, setIncludePii] = useState(false);
  const [consent,    setConsent]    = useState(false);

  // Date window + live count from the meta endpoint
  const [minDate, setMinDate] = useState("");
  const [maxDate, setMaxDate] = useState("");
  const [from,    setFrom]    = useState("");
  const [to,      setTo]      = useState("");
  const [count,   setCount]   = useState<number | null>(null);

  const [exporting, setExporting] = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  const filters: TransactionFilters = {
    decision:  decision !== "ALL" ? decision : undefined,
    reviewed:  status === "ALL" ? undefined : status === "REVIEWED",
    risk:      risk !== "ALL" ? risk : undefined,
    customers: selectedCustomers.length ? selectedCustomers : undefined,
  };

  // Seed filters from the table whenever the modal opens
  useEffect(() => {
    if (!isOpen) return;
    setDecision(currentFilters.decision ?? "ALL");
    setStatus(currentFilters.reviewed === undefined ? "ALL" : currentFilters.reviewed ? "REVIEWED" : "PENDING");
    setRisk(currentFilters.risk ?? "ALL");
    setSortField(sort ?? "timestamp");       // seed from the table's current sort
    setSortDir(order ?? "desc");
    setError(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // On open / filter change: fetch bounds + total count, reset range to full window
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setCount(null);
    getExportMeta(filters)
      .then((m) => {
        if (cancelled) return;
        setMinDate(m.min_date ?? "");
        setMaxDate(m.max_date ?? "");
        setFrom(m.min_date ?? "");
        setTo(m.max_date ?? "");
        setCount(m.count);
      })
      .catch(() => { if (!cancelled) setCount(0); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, decision, status, risk, selectedCustomers]);

  // Refresh the count when the user narrows the date range
  const refreshCount = useCallback((f: string, t: string) => {
    getExportMeta(filters, { dateFrom: f || undefined, dateTo: t || undefined })
      .then((m) => setCount(m.count))
      .catch(() => setCount(null));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decision, status, risk, selectedCustomers]);

  const visibleColumns = includePii ? [...EXPORT_COLUMNS, ...PII_COLUMNS] : EXPORT_COLUMNS;
  const visibleKeys    = visibleColumns.map((c) => c.key);
  const allChecked     = visibleKeys.every((k) => selected.includes(k));

  const toggleAll = () => setSelected(allChecked ? [] : [...visibleKeys]);
  const toggle = (key: string) =>
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const togglePii = (on: boolean) => {
    setIncludePii(on);
    setError(null);
    if (on) setSelected((prev) => [...prev, ...PII_KEYS.filter((k) => !prev.includes(k))]);
    else { setConsent(false); setSelected((prev) => prev.filter((k) => !PII_KEYS.includes(k))); }
  };

  const handleDownload = async () => {
    if (selected.length === 0) { setError("Select at least one column."); return; }
    if (from && to && from > to) { setError("Start date must be on or before the end date."); return; }
    if (includePii && !consent) { setError("Please confirm the PII consent checkbox."); return; }
    setError(null);
    setExporting(true);
    try {
      await exportTransactions(filters, {
        columns:  visibleKeys.filter((k) => selected.includes(k)),
        dateFrom: from || undefined,
        dateTo:   to || undefined,
        sort:     sortField,
        order:    sortDir,
        format,
        pii:      includePii,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const noData = !minDate;

  function seg<T extends string>(value: T, current: T, set: (v: T) => void, label: string) {
    return (
      <button
        type="button"
        onClick={() => set(value)}
        className={`flex-1 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors ${
          current === value
            ? "bg-brand-500 text-white"
            : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5"
        }`}
      >
        {label}
      </button>
    );
  }
  const dateInput = "min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300";

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-3xl mx-4 p-6 sm:p-8">
      {/* Customers + Sort — panels docked to the left of the centered export card,
          Customers stacked on top of Sort */}
      <div className="absolute right-full top-1/2 mr-4 hidden w-72 -translate-y-1/2 space-y-4 lg:block">
        {/* Customers (on top) */}
        <div className="rounded-3xl bg-white p-6 shadow-theme-lg dark:bg-gray-900">
          <CustomerFilterPanel selected={selectedCustomers} onChange={onCustomersChange} />
        </div>

        {/* Sort (below) */}
        <div className="rounded-3xl bg-white p-6 shadow-theme-lg dark:bg-gray-900">
          <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">Sort</h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Choose how rows are ordered in the exported file.
          </p>
          <div className="mt-4 space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">Sort by</label>
              <select
                value={sortField}
                onChange={(e) => setSortField(e.target.value)}
                className={dateInput + " w-full"}
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.key} value={o.key}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">Order</label>
              <div className="flex gap-1 rounded-xl bg-gray-100 p-1 dark:bg-gray-800">
                {seg<"asc" | "desc">("desc", sortDir, setSortDir, "Descending")}
                {seg<"asc" | "desc">("asc", sortDir, setSortDir, "Ascending")}
              </div>
            </div>
          </div>
        </div>
      </div>

      <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Export transactions</h2>
      <p className="mt-1 mb-5 text-sm text-gray-500 dark:text-gray-400">
        Privacy-safe by default — no decrypted card or IC numbers unless you enable PII below.
      </p>

      {/* Filters */}
      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">Decision</label>
          <div className="flex gap-1 rounded-xl bg-gray-100 p-1 dark:bg-gray-800">
            {seg<Decision>("ALL", decision, setDecision, "All")}
            {seg<Decision>("FRAUD", decision, setDecision, "Fraud")}
            {seg<Decision>("LEGIT", decision, setDecision, "Legit")}
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">Status</label>
          <div className="flex gap-1 rounded-xl bg-gray-100 p-1 dark:bg-gray-800">
            {seg<Status>("ALL", status, setStatus, "All")}
            {seg<Status>("PENDING", status, setStatus, "Pending")}
            {seg<Status>("REVIEWED", status, setStatus, "Done")}
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">Risk</label>
          <div className="flex gap-1 rounded-xl bg-gray-100 p-1 dark:bg-gray-800">
            {seg<Risk>("ALL", risk, setRisk, "All")}
            {seg<Risk>("LOW", risk, setRisk, "Low")}
            {seg<Risk>("MEDIUM", risk, setRisk, "Med")}
            {seg<Risk>("HIGH", risk, setRisk, "High")}
          </div>
        </div>
      </div>

      {/* Date range + format */}
      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">
            Date range {minDate && <span className="normal-case text-gray-400">({minDate} – {maxDate})</span>}
          </label>
          <div className="flex items-center gap-2">
            <FlatpickrInput value={from} minDate={minDate} maxDate={to || maxDate} disabled={noData}
              placeholder="Start" className={dateInput}
              onChange={(d) => { setFrom(d); refreshCount(d, to); }} />
            <span className="shrink-0 text-gray-400">to</span>
            <FlatpickrInput value={to} minDate={from || minDate} maxDate={maxDate} disabled={noData}
              placeholder="End" className={dateInput}
              onChange={(d) => { setTo(d); refreshCount(from, d); }} />
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">Format</label>
          <div className="flex gap-1 rounded-xl bg-gray-100 p-1 dark:bg-gray-800">
            {seg<"csv" | "xlsx">("csv", format, setFormat, "CSV")}
            {seg<"csv" | "xlsx">("xlsx", format, setFormat, "Excel")}
          </div>
        </div>
      </div>

      {/* Columns */}
      <div className="mb-1.5 flex items-center justify-between">
        <label className="text-xs font-medium uppercase tracking-wide text-gray-400">
          Columns ({selected.length}/{visibleKeys.length})
        </label>
        <button type="button" onClick={toggleAll} className="text-xs font-medium text-brand-500 hover:text-brand-600 dark:text-brand-400">
          {allChecked ? "Clear all" : "Select all"}
        </button>
      </div>
      <div className="mb-5 grid max-h-60 grid-cols-3 gap-x-4 gap-y-2 overflow-y-auto rounded-lg border border-gray-200 p-4 dark:border-gray-700">
        {visibleColumns.map((col) => {
          const isPii = PII_KEYS.includes(col.key);
          return (
            <label key={col.key} className={`flex cursor-pointer items-center gap-2 text-sm ${isPii ? "text-error-600 dark:text-error-400" : "text-gray-700 dark:text-gray-300"}`}>
              <input type="checkbox" checked={selected.includes(col.key)} onChange={() => toggle(col.key)}
                className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500" />
              {col.label}
            </label>
          );
        })}
      </div>

      {/* PII gate */}
      {canExportPii && (
        <div className="mb-5 rounded-lg border border-error-200 bg-error-50 p-3 dark:border-error-500/30 dark:bg-error-500/10">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-error-700 dark:text-error-400">
            <input type="checkbox" checked={includePii} onChange={(e) => togglePii(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-error-500 focus:ring-error-500" />
            Include full PII (decrypted IC &amp; card numbers)
          </label>
          {includePii && (
            <label className="mt-2 flex cursor-pointer items-start gap-2 text-xs text-error-700 dark:text-error-400">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-error-500 focus:ring-error-500" />
              I am authorized to export decrypted personal data and will handle this file accordingly.
            </label>
          )}
        </div>
      )}

      {error && <p className="mb-3 text-sm text-error-500">{error}</p>}

      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {count === null ? "Counting…" : <><span className="font-semibold text-gray-700 dark:text-gray-200">{count.toLocaleString()}</span> row{count !== 1 ? "s" : ""} to export</>}
        </span>
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5">
            Cancel
          </button>
          <button type="button" onClick={handleDownload} disabled={exporting || selected.length === 0 || count === 0}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50">
            {exporting ? "Exporting…" : `Download ${format.toUpperCase()}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
