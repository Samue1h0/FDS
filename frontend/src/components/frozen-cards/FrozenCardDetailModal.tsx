"use client";
import React, { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import Badge from "@/components/ui/badge/Badge";
import { LockIcon } from "@/icons";
import { useAuth } from "@/context/AuthContext";
import {
  getFrozenCard,
  getCustomerKyc,
  type FrozenCard,
  type FrozenCardDetail,
  type FrozenCardTxn,
  type KYCProfile,
} from "@/services/fraudApi";

const formatMoney = (n: number) =>
  "RM " + n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatDateTime = (iso: string) =>
  iso
    ? new Date(iso).toLocaleString("en-MY", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-xs text-gray-400 dark:text-gray-500">{label}</dt>
      <dd className="text-sm text-gray-800 dark:text-white/90">{value || "—"}</dd>
    </div>
  );
}

function TxnRow({ t }: { t: FrozenCardTxn }) {
  const isFraud = t.predicted_label === "FRAUD";
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 ${
        t.is_post_freeze
          ? "border-error-200 bg-error-50/50 dark:border-error-500/30 dark:bg-error-500/5"
          : "border-gray-100 bg-gray-50/60 dark:border-gray-800 dark:bg-white/[0.02]"
      }`}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-gray-800 dark:text-white/90">
          {t.merchant_name || "—"}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {formatDateTime(t.timestamp)}
          {t.location ? ` · ${t.location}` : ""}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {t.is_post_freeze && (
          <span className="rounded-full bg-error-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-error-600 dark:bg-error-500/20 dark:text-error-400">
            post-freeze
          </span>
        )}
        <span className="whitespace-nowrap text-sm font-medium text-gray-800 dark:text-white/90">
          {formatMoney(t.amount_myr)}
        </span>
        <Badge color={isFraud ? "error" : "success"}>{t.predicted_label}</Badge>
      </div>
    </div>
  );
}

interface Props {
  card: FrozenCard | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function FrozenCardDetailModal({ card, isOpen, onClose }: Props) {
  const { piiConsented, grantPiiConsent } = useAuth();

  const [detail, setDetail] = useState<FrozenCardDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [kyc, setKyc] = useState<KYCProfile | null>(null);
  const [loadingKyc, setLoadingKyc] = useState(false);
  const [kycError, setKycError] = useState<string | null>(null);
  const [consentChecked, setConsentChecked] = useState(false);

  // Transaction history.
  useEffect(() => {
    if (!isOpen || !card) return;
    setDetail(null);
    setError(null);
    setKyc(null);
    setKycError(null);
    setConsentChecked(false);
    setLoading(true);
    let active = true;
    getFrozenCard(card.card_hash)
      .then((d) => { if (active) setDetail(d); })
      .catch((e) => { if (active) setError(e instanceof Error ? e.message : "Failed to load card"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [isOpen, card]);

  // Cardholder KYC — only once PII consent is granted (session-wide).
  useEffect(() => {
    if (!isOpen || !card || !piiConsented) return;
    setLoadingKyc(true);
    setKycError(null);
    let active = true;
    getCustomerKyc(card.customer_ref)
      .then((k) => { if (active) setKyc(k); })
      .catch((e) => { if (active) setKycError(e instanceof Error ? e.message : "Failed to load identity"); })
      .finally(() => { if (active) setLoadingKyc(false); });
    return () => { active = false; };
  }, [isOpen, card, piiConsented]);

  if (!card) return null;

  const txns = detail?.transactions ?? [];
  let dividerShown = false;

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="mx-4 max-w-2xl p-6 sm:p-8">
      <div className="mb-5 flex items-start gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-error-50 dark:bg-error-500/15">
          <LockIcon className="size-5 text-error-600 dark:text-error-500" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">Frozen Card</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {card.customer_ref} · •••• {card.card_last4}
          </p>
        </div>
      </div>

      <div className="mb-5 rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400">
        Card frozen on {formatDateTime(card.frozen_at)} — first fraud: {card.trigger_txn_id}
        {card.trigger_reasons.length > 0 && (
          <div className="mt-1 text-xs opacity-90">{card.trigger_reasons.join(" · ")}</div>
        )}
      </div>

      {/* Cardholder identity — PII gated */}
      <div className="mb-5 rounded-xl border border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-2.5 dark:border-gray-800">
          <LockIcon className="size-4 text-gray-400" />
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Cardholder Identity
          </h4>
          {!piiConsented && <span className="ml-auto text-xs text-gray-400">PII — hidden</span>}
        </div>
        <div className="p-4">
          {!piiConsented ? (
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Reveals personal data: full name, IC number, date of birth, contact details, and
                employment/income.
              </p>
              <label className="mt-3 flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  checked={consentChecked}
                  onChange={(e) => setConsentChecked(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-500"
                />
                <span className="text-xs text-gray-600 dark:text-gray-300">
                  I understand I am accessing sensitive personal data and will handle it
                  responsibly.
                </span>
              </label>
              <button
                type="button"
                disabled={!consentChecked}
                onClick={grantPiiConsent}
                className="mt-3 rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Reveal identity
              </button>
            </div>
          ) : loadingKyc ? (
            <p className="text-sm text-gray-400">Loading identity…</p>
          ) : kycError ? (
            <p className="text-sm text-error-500">{kycError}</p>
          ) : kyc ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
              <Field label="Name" value={kyc.name} />
              <Field label="IC Number" value={kyc.ic_number} />
              <Field label="Date of Birth" value={kyc.date_of_birth} />
              <Field label="Gender" value={kyc.gender} />
              <Field label="Phone" value={kyc.phone_number} />
              <Field label="Employment" value={kyc.employment_status} />
              <Field label="Job Title" value={kyc.job_title} />
              <Field label="Income" value={kyc.income_range} />
              <Field label="Location" value={[kyc.city, kyc.state].filter(Boolean).join(", ")} />
            </dl>
          ) : (
            <p className="text-sm text-gray-400">No identity on file.</p>
          )}
        </div>
      </div>

      <h4 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
        Transaction history{detail ? ` (${txns.length})` : ""}
      </h4>

      {loading && <p className="py-6 text-center text-sm text-gray-400">Loading…</p>}
      {error && <p className="py-6 text-center text-sm text-error-500">{error}</p>}

      {!loading && !error && (
        <div className="custom-scrollbar max-h-[40vh] space-y-2 overflow-y-auto pr-1">
          {txns.map((t) => {
            const showDivider = t.is_post_freeze && !dividerShown;
            if (showDivider) dividerShown = true;
            return (
              <React.Fragment key={t.transaction_id}>
                {showDivider && (
                  <div className="flex items-center gap-2 py-1 text-xs font-semibold uppercase tracking-wide text-error-500">
                    <span className="h-px flex-1 bg-error-200 dark:bg-error-500/30" />
                    <LockIcon className="size-4" />
                    Frozen here
                    <span className="h-px flex-1 bg-error-200 dark:bg-error-500/30" />
                  </div>
                )}
                <TxnRow t={t} />
              </React.Fragment>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
