"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import Badge from "@/components/ui/badge/Badge";
import { useAuth } from "@/context/AuthContext";
import {
  getTransaction,
  getCustomerTransactions,
  getCustomerKyc,
  reviewTransaction,
  type Transaction,
  type KYCProfile,
} from "@/services/fraudApi";

interface ReviewModalProps {
  transaction: Transaction | null;
  isOpen:      boolean;
  onClose:     () => void;
  onSuccess:   () => void;
}

type Tab = "details" | "history";

function getRisk(score: number): { label: string; color: "success" | "warning" | "error" } {
  if (score >= 0.8) return { label: "High",   color: "error"   };
  if (score >= 0.6) return { label: "Medium", color: "warning" };
  return                    { label: "Low",    color: "success" };
}

function maskCard(card: string) {
  const digits = card.replace(/\.0+$/, "").replace(/\D/g, "");
  if (digits.length < 4) return card;
  const masked = "*".repeat(digits.length - 4) + digits.slice(-4);
  return masked.match(/.{1,4}/g)?.join(" ") ?? masked;
}

export default function ReviewModal({ transaction, isOpen, onClose, onSuccess }: ReviewModalProps) {
  const { user, piiConsented, grantPiiConsent } = useAuth();
  const [consentChecked, setConsentChecked] = useState(false);

  const [activeTab,      setActiveTab]      = useState<Tab>("details");
  const [detail,         setDetail]         = useState<Transaction | null>(null);
  const [history,        setHistory]        = useState<Transaction[]>([]);
  const [kyc,            setKyc]            = useState<KYCProfile | null>(null);
  const [loadingDetail,  setLoadingDetail]  = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingKyc,     setLoadingKyc]     = useState(false);
  const [selectedLabel,  setSelectedLabel]  = useState<0 | 1 | null>(null);
  const [notes,          setNotes]          = useState("");
  const [submitting,     setSubmitting]     = useState(false);
  const [error,          setError]          = useState<string | null>(null);

  const reviewerId = user?.username ?? "";

  // Fetch detail + customer history in parallel when modal opens
  useEffect(() => {
    if (!isOpen || !transaction) return;

    setDetail(null);
    setHistory([]);
    setKyc(null);
    setActiveTab("details");

    setLoadingDetail(true);
    getTransaction(transaction.transaction_id)
      .then(setDetail)
      .catch(() => setDetail(transaction))
      .finally(() => setLoadingDetail(false));

    setLoadingHistory(true);
    getCustomerTransactions(transaction.customer_ref)
      .then(res => setHistory(
        res.transactions.filter(t => t.transaction_id !== transaction.transaction_id)
      ))
      .catch(() => setHistory([]))
      .finally(() => setLoadingHistory(false));

    setLoadingKyc(true);
    getCustomerKyc(transaction.customer_ref)
      .then(setKyc)
      .catch(() => setKyc(null))
      .finally(() => setLoadingKyc(false));
  }, [isOpen, transaction]);

  if (!transaction) return null;

  const txn  = detail ?? transaction;
  const risk = getRisk(txn.fraud_score);
  const historyCount = loadingHistory ? null : history.length;

  const handleClose = () => {
    setSelectedLabel(null);
    setConsentChecked(false);
    setNotes("");
    setError(null);
    onClose();
  };

  const handleSubmit = async () => {
    if (selectedLabel === null) { setError("Select a verdict first."); return; }
    setError(null);
    setSubmitting(true);
    try {
      await reviewTransaction(transaction.transaction_id, {
        ground_truth_label: selectedLabel,
        reviewer_id:        reviewerId.trim(),
        notes:              notes.trim() || undefined,
      });
      setSelectedLabel(null);
      setNotes("");
      onSuccess();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Submission failed. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── PII consent gate ────────────────────────────────────────────
  if (isOpen && transaction && !piiConsented) {
    return (
      <Modal isOpen={isOpen} onClose={handleClose} className="max-w-md mx-4 p-6 sm:p-8">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-14 h-14 rounded-full bg-warning-50 dark:bg-warning-500/10 flex items-center justify-center mb-4">
            <svg className="w-7 h-7 text-warning-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90 mb-2">
            Sensitive Data Notice
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
            You are about to access a transaction investigation that contains sensitive personal information, including:
          </p>
          <ul className="mt-3 text-sm text-gray-600 dark:text-gray-300 space-y-1 text-left w-full bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4">
            <li className="flex gap-2"><span className="text-warning-500 shrink-0">•</span> National ID (IC) number</li>
            <li className="flex gap-2"><span className="text-warning-500 shrink-0">•</span> Card number and expiry date</li>
            <li className="flex gap-2"><span className="text-warning-500 shrink-0">•</span> Full name, address, and contact details</li>
            <li className="flex gap-2"><span className="text-warning-500 shrink-0">•</span> Financial and employment information</li>
          </ul>
        </div>

        <label className="flex items-start gap-3 cursor-pointer mb-6">
          <input
            type="checkbox"
            checked={consentChecked}
            onChange={e => setConsentChecked(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-gray-300 text-brand-500 cursor-pointer"
          />
          <span className="text-sm text-gray-600 dark:text-gray-300">
            I understand that I am accessing sensitive personal data and take full responsibility for maintaining its confidentiality. I will not disclose or misuse this information.
          </span>
        </label>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleClose}
            className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!consentChecked}
            onClick={grantPiiConsent}
            className="flex-1 rounded-xl bg-brand-500 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Proceed
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} className="max-w-2xl mx-4 p-6 sm:p-8">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90 mb-0.5">
        Review Transaction
      </h2>
      <p className="text-xs text-gray-400 dark:text-gray-500 font-mono mb-4">
        {transaction.transaction_id}
      </p>

      {/* ── Tab bar ────────────────────────────────────────────────── */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700 mb-5">
        <TabBtn active={activeTab === "details"} onClick={() => setActiveTab("details")}>
          Details
        </TabBtn>
        <TabBtn active={activeTab === "history"} onClick={() => setActiveTab("history")}>
          Customer History
          {historyCount !== null && (
            <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-xs font-medium ${
              activeTab === "history"
                ? "bg-brand-500 text-white"
                : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
            }`}>
              {historyCount}
            </span>
          )}
        </TabBtn>
      </div>

      {/* ── Tab content ────────────────────────────────────────────── */}
      {activeTab === "details" ? (
        loadingDetail ? (
          <div className="flex items-center justify-center py-10 text-sm text-gray-400 mb-6">
            Loading investigation data…
          </div>
        ) : (
          <div className="rounded-xl bg-gray-50 dark:bg-gray-800/50 p-5 mb-6 max-h-[45vh] overflow-y-auto custom-scrollbar">

            <SectionLabel>Cardholder Identity</SectionLabel>
            <div className="grid grid-cols-2 gap-x-8 gap-y-2.5 text-sm mb-5">
              <Row label="Full Name"   value={txn.cardholder_name     ?? "—"} />
              <Row label="IC Number"   value={txn.ic_number            ?? "—"} sensitive />
              <Row label="Card Number" value={txn.card_number ? maskCard(txn.card_number) : (txn.masked_card_number ?? "—")} sensitive mono />
              <Row label="Card Expiry" value={txn.card_expiration_date ?? "—"} />
            </div>

            <Divider />

            <SectionLabel>Transaction Details</SectionLabel>
            <div className="grid grid-cols-2 gap-x-8 gap-y-2.5 text-sm mb-5">
              <Row label="Merchant"     value={txn.merchant_name} />
              <Row label="Amount"       value={`RM ${txn.amount_myr.toLocaleString("en-MY", { minimumFractionDigits: 2 })}`} />
              <Row label="Customer Ref" value={txn.customer_ref} />
              <Row label="Mode"         value={txn.mode} />
              <Row label="Location"     value={txn.location} />
              <Row label="MCC"          value={txn.mcc} />
            </div>

            <Divider />

            <SectionLabel>Fraud Assessment</SectionLabel>
            <div className="grid grid-cols-2 gap-x-8 gap-y-2.5 text-sm">
              <div className="flex justify-between col-span-1">
                <span className="text-gray-500 dark:text-gray-400">Fraud Score</span>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-800 dark:text-white/90">
                    {(txn.fraud_score * 100).toFixed(1)}%
                  </span>
                  <Badge size="sm" color={risk.color}>{risk.label}</Badge>
                </div>
              </div>
              <Row label="ML Prediction" value={txn.ml_prediction === 1 ? "Fraud" : "Legit"} />
              <Row label="Rule Flag"     value={txn.rule_flag     === 1 ? "Flagged" : "Clear"} />
              <Row label="Decision"      value={txn.predicted_label} />
            </div>

            {txn.risk_reasons && txn.risk_reasons.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <SectionLabel>Risk Reasons</SectionLabel>
                <ul className="space-y-1">
                  {txn.risk_reasons.map((r, i) => (
                    <li key={i} className="flex gap-2 text-xs text-gray-600 dark:text-gray-300">
                      <span className="text-error-400 shrink-0">•</span>
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <Divider />

            <SectionLabel>Customer Profile</SectionLabel>
            {loadingKyc ? (
              <p className="text-xs text-gray-400 dark:text-gray-500 italic">Loading KYC data…</p>
            ) : !kyc ? (
              <p className="text-xs text-gray-400 dark:text-gray-500 italic">KYC profile not available</p>
            ) : (
              <div className="grid grid-cols-2 gap-x-8 gap-y-2.5 text-sm">
                <Row label="Employment"   value={kyc.employment_status ?? "—"} />
                <Row label="Job Title"    value={kyc.job_title         ?? "—"} />
                <Row label="Income Range" value={kyc.income_range      ?? "—"} />
                <Row label="Nationality"  value={kyc.nationality       ?? "—"} />
                <Row label="Marital"      value={kyc.marital_status    ?? "—"} />
                <Row label="Date of Birth" value={kyc.date_of_birth    ?? "—"} />
                <Row label="Gender"       value={kyc.gender            ?? "—"} />
                <Row label="Phone"        value={kyc.phone_number      ?? "—"} sensitive />
                <Row label="City"         value={kyc.city              ?? "—"} />
                <Row label="State"        value={kyc.state             ?? "—"} />
                {kyc.street_address && (
                  <div className="col-span-2 flex justify-between items-start gap-2">
                    <span className="text-gray-500 dark:text-gray-400 shrink-0">Address</span>
                    <span className="text-right text-gray-700 dark:text-gray-300 break-all">
                      {kyc.street_address}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      ) : (
        // ── Customer History tab ────────────────────────────────────
        <div className="mb-6 max-h-[45vh] overflow-y-auto custom-scrollbar rounded-xl border border-gray-200 dark:border-gray-700">
          {loadingHistory ? (
            <div className="flex items-center justify-center py-10 text-sm text-gray-400">
              Loading customer history…
            </div>
          ) : history.length === 0 ? (
            <div className="flex items-center justify-center py-10 text-sm text-gray-400">
              No other transactions found for {transaction.customer_ref}
            </div>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/80">
                <tr>
                  {["Date", "Merchant", "Amount (MYR)", "Risk", "Decision", "Status"].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {history.map(t => {
                  const r        = getRisk(t.fraud_score);
                  const reviewed = !!(t.reviewed_by && t.reviewed_by !== "");
                  const decColor = t.predicted_label === "FRAUD" ? "error" : t.predicted_label === "LEGIT" ? "success" : "light";
                  return (
                    <tr key={t.transaction_id} className="hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <p className="text-xs text-gray-700 dark:text-gray-300">
                          {new Date(t.timestamp).toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric" })}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500">
                          {new Date(t.timestamp).toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </td>
                      <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300 max-w-[130px] truncate">
                        {t.merchant_name}
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        RM {t.amount_myr.toLocaleString("en-MY", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge size="sm" color={r.color}>{r.label}</Badge>
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge size="sm" color={decColor}>{t.predicted_label}</Badge>
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge size="sm" color={reviewed ? "success" : "warning"}>
                          {reviewed ? "Reviewed" : "Pending"}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Verdict — always visible ────────────────────────────────── */}
      <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Verdict</p>
      <div className="flex gap-3 mb-5">
        <button
          type="button"
          onClick={() => setSelectedLabel(1)}
          className={`flex-1 rounded-xl py-3 text-sm font-semibold border-2 transition-colors ${
            selectedLabel === 1
              ? "border-error-500 bg-error-50 text-error-600 dark:bg-error-500/10 dark:text-error-400"
              : "border-gray-200 text-gray-500 hover:border-error-300 hover:text-error-500 dark:border-gray-700 dark:text-gray-400 dark:hover:border-error-700"
          }`}
        >
          Confirm Fraud
        </button>
        <button
          type="button"
          onClick={() => setSelectedLabel(0)}
          className={`flex-1 rounded-xl py-3 text-sm font-semibold border-2 transition-colors ${
            selectedLabel === 0
              ? "border-success-500 bg-success-50 text-success-600 dark:bg-success-500/10 dark:text-success-400"
              : "border-gray-200 text-gray-500 hover:border-success-300 hover:text-success-500 dark:border-gray-700 dark:text-gray-400 dark:hover:border-success-700"
          }`}
        >
          Mark Legitimate
        </button>
      </div>

      {/* ── Reviewer fields ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 mb-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            Reviewer
          </label>
          <div className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
            {reviewerId}
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            Notes <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <input
            type="text"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Any additional observations…"
            className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-gray-600"
          />
        </div>
      </div>

      {error && (
        <p className="text-sm text-error-600 dark:text-error-400 mb-3">{error}</p>
      )}

      {/* ── Actions ─────────────────────────────────────────────────── */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleClose}
          disabled={submitting}
          className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/5 transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || selectedLabel === null}
          className="flex-1 rounded-xl bg-brand-500 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? "Submitting…" : "Submit Review"}
        </button>
      </div>
    </Modal>
  );
}

// ── Small helper components ─────────────────────────────────────────────────

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1 px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
        active
          ? "border-brand-500 text-brand-600 dark:text-brand-400"
          : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
      }`}
    >
      {children}
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3">
      {children}
    </p>
  );
}

function Divider() {
  return <div className="border-t border-gray-200 dark:border-gray-700 my-4" />;
}

function Row({ label, value, sensitive, mono }: { label: string; value: string; sensitive?: boolean; mono?: boolean }) {
  return (
    <div className="flex justify-between items-start gap-2">
      <span className="text-gray-500 dark:text-gray-400 shrink-0">{label}</span>
      <span className={`text-right break-all ${mono ? "font-mono" : ""} ${sensitive ? "text-gray-800 dark:text-white/90 font-medium" : "text-gray-700 dark:text-gray-300"}`}>
        {value}
      </span>
    </div>
  );
}
