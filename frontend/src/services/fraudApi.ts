// src/services/fraudApi.ts
// ---------------------------------------------------------------------------
// Fraud Detection API — service layer for Next.js / TailAdmin frontend
// ---------------------------------------------------------------------------
// Setup:
//   .env.local       →  NEXT_PUBLIC_API_URL=http://localhost:8000
//   .env.production  →  NEXT_PUBLIC_API_URL=https://your-backend-domain.com
// ---------------------------------------------------------------------------

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:8000";

// ── Generic fetch wrapper ────────────────────────────────────────────────────

async function apiFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...options,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error?.detail ?? `API error ${res.status}`);
  }

  return res.json() as Promise<T>;
}

// ── Types ────────────────────────────────────────────────────────────────────

/** A single fraud transaction as returned from GET /api/transactions/{id} */
export interface Transaction {
  // Core transaction fields
  transaction_id: string;
  timestamp: string;               // "YYYY-MM-DD HH:MM:SS"
  amount_myr: number;
  merchant_name: string;
  mcc: string;
  mode: string;
  location: string;

  // Privacy-safe identifiers
  customer_ref: string;
  ic_hash: string;
  masked_card_number: string;

  // Fraud assessment
  fraud_score: number;             // 0.0 – 1.0
  ml_prediction: number;           // 0 or 1
  rule_flag: number;               // 0 or 1
  predicted_label: "FRAUD" | "LEGIT" | "pending";
  risk_reasons: string[];

  // Review outcome
  ground_truth_label: number;      // 0 or 1
  reviewed_by: string;
  reviewed_at: string;

  // Audit
  created_by: string;
  created_at: string;

  // Private enrichment fields (only present on detail endpoint GET /api/transactions/{id})
  cardholder_name?: string;
  card_expiration_date?: string;
  ic_number?: string;
  card_number?: string;
  private_reviewed_by?: string;
  private_reviewed_at?: string;
  notes?: string;
  private_data_error?: string;
}

/** Paginated list response from GET /api/transactions */
export interface TransactionListResponse {
  total: number;
  transactions: Transaction[];
}

/** Query params for GET /api/transactions */
export interface TransactionFilters {
  decision?: "FRAUD" | "LEGIT";
  reviewed?: boolean;
  search?: string;
  risk?: "LOW" | "MEDIUM" | "HIGH";
  limit?: number;
  offset?: number;
}

/** GET /api/stats */
export interface Stats {
  total: number;
  fraud_count: number;
  legit_count: number;
  pending_review: number;
  reviewed: number;
  avg_fraud_score: number;
}

/** Single entry in GET /api/charts/fraud-trend */
export interface FraudTrendEntry {
  date: string;   // "YYYY-MM-DD"
  fraud: number;
  legit: number;
}

/** Single bucket in GET /api/charts/score-distribution */
export interface ScoreDistributionEntry {
  range: string;  // e.g. "0.0-0.2"
  count: number;
}

/** Full KYC profile from GET /api/customers/{customer_ref} */
export interface KYCProfile {
  customer_ref:      string;
  ic_hash:           string;
  ic_number:         string | null;
  name:              string | null;
  date_of_birth:     string | null;
  gender:            string | null;
  phone_number:      string | null;
  street_address:    string | null;
  city:              string | null;
  state:             string | null;
  country:           string | null;
  nationality:       string | null;
  marital_status:    string | null;
  employment_status: string | null;
  job_title:         string | null;
  income_range:      string | null;
  created_at:        string | null;
}

/** Body for POST /api/transactions/{id}/review */
export interface ReviewRequest {
  ground_truth_label: 0 | 1;
  reviewer_id: string;
  notes?: string;
}

/** Response from POST /api/transactions/{id}/review */
export interface ReviewResponse {
  status: "SUCCESS";
  transaction_id: string;
}

/** Single entry in GET /api/transactions/{id}/history */
export interface HistoryRecord {
  tx_id: string;
  timestamp: string;
  is_delete: boolean;
  record: Transaction;
}

// ── Transactions ─────────────────────────────────────────────────────────────

/**
 * List transactions with optional filters.
 *
 * @example
 * const { total, transactions } = await getTransactions({ decision: "FRAUD", limit: 20 });
 */
export async function getTransactions(
  filters: TransactionFilters = {}
): Promise<TransactionListResponse> {
  const params = new URLSearchParams();

  if (filters.decision)              params.set("decision", filters.decision);
  if (filters.reviewed !== undefined) params.set("reviewed", String(filters.reviewed));
  if (filters.search)                params.set("search", filters.search);
  if (filters.risk)                  params.set("risk", filters.risk);
  if (filters.limit !== undefined)   params.set("limit", String(filters.limit));
  if (filters.offset !== undefined)  params.set("offset", String(filters.offset));

  const query = params.toString();
  return apiFetch<TransactionListResponse>(
    `/api/transactions${query ? `?${query}` : ""}`
  );
}

/** Response from GET /api/transactions/customer/{customer_ref} */
export interface CustomerTransactionsResponse {
  customer_ref:  string;
  total:         number;
  transactions:  Transaction[];
}

/**
 * Get all transactions for a specific customer (Fabric public data only, no PII).
 * Returns up to `limit` results sorted newest first.
 */
export async function getCustomerTransactions(
  customerRef: string,
  limit = 20
): Promise<CustomerTransactionsResponse> {
  return apiFetch<CustomerTransactionsResponse>(
    `/api/transactions/customer/${encodeURIComponent(customerRef)}?limit=${limit}`
  );
}

/**
 * Get a single transaction by ID (enriched with private Postgres data).
 *
 * @example
 * const txn = await getTransaction("TXN-001");
 */
export async function getTransaction(transactionId: string): Promise<Transaction> {
  return apiFetch<Transaction>(`/api/transactions/${encodeURIComponent(transactionId)}`);
}

/**
 * Get the full blockchain audit history for a transaction.
 *
 * @example
 * const history = await getTransactionHistory("TXN-001");
 */
export async function getTransactionHistory(
  transactionId: string
): Promise<HistoryRecord[]> {
  return apiFetch<HistoryRecord[]>(
    `/api/transactions/${encodeURIComponent(transactionId)}/history`
  );
}

/**
 * Submit a fraud review (updates both blockchain + Postgres).
 *
 * @example
 * await reviewTransaction("TXN-001", { ground_truth_label: 1, reviewer_id: "analyst-01" });
 */
export async function reviewTransaction(
  transactionId: string,
  body: ReviewRequest
): Promise<ReviewResponse> {
  return apiFetch<ReviewResponse>(
    `/api/transactions/${encodeURIComponent(transactionId)}/review`,
    {
      method: "POST",
      body: JSON.stringify(body),
    }
  );
}

// ── Customers (KYC) ──────────────────────────────────────────────────────────

/**
 * Get the full KYC profile for a customer.
 * Returns decrypted IC number and all KYC fields.
 */
export async function getCustomerKyc(customerRef: string): Promise<KYCProfile> {
  return apiFetch<KYCProfile>(`/api/customers/${encodeURIComponent(customerRef)}`);
}

// ── Stats ─────────────────────────────────────────────────────────────────────

/**
 * Get summary stats for the dashboard stat cards.
 *
 * @example
 * const stats = await getStats();
 * // { total, fraud_count, legit_count, pending_review, reviewed, avg_fraud_score }
 */
export async function getStats(): Promise<Stats> {
  return apiFetch<Stats>("/api/stats");
}

// ── Charts ────────────────────────────────────────────────────────────────────

/**
 * Get daily fraud vs legit counts for the trend chart.
 *
 * @example
 * const trend = await getFraudTrend();
 * // [{ date: "2024-01-01", fraud: 3, legit: 12 }, ...]
 */
export async function getFraudTrend(): Promise<FraudTrendEntry[]> {
  return apiFetch<FraudTrendEntry[]>("/api/charts/fraud-trend");
}

/**
 * Get fraud score distribution for the histogram/bar chart.
 *
 * @example
 * const dist = await getScoreDistribution();
 * // [{ range: "0.0-0.2", count: 45 }, ...]
 */
export async function getScoreDistribution(): Promise<ScoreDistributionEntry[]> {
  return apiFetch<ScoreDistributionEntry[]>("/api/charts/score-distribution");
}

// ── Convenience helpers ───────────────────────────────────────────────────────

/**
 * Returns only FRAUD transactions that haven't been reviewed yet.
 * Useful for the "pending review" queue.
 */
export async function getPendingReviews(
  limit = 50,
  offset = 0
): Promise<TransactionListResponse> {
  return getTransactions({ decision: "FRAUD", reviewed: false, limit, offset });
}

/**
 * Returns only reviewed transactions.
 */
export async function getReviewedTransactions(
  limit = 50,
  offset = 0
): Promise<TransactionListResponse> {
  return getTransactions({ reviewed: true, limit, offset });
}

/**
 * Search transactions by ID, merchant name, or customer_ref.
 */
export async function searchTransactions(
  query: string,
  limit = 50
): Promise<TransactionListResponse> {
  return getTransactions({ search: query, limit });
}

// ── Detection triggers ────────────────────────────────────────────────────────

export interface MlFeatureImportance {
  label:      string;
  raw:        string;
  group:      string;   // Velocity | Engineered | Transaction | Profile | Other
  importance: number;
}

export interface TriggerStats {
  total_transactions: number;
  total_fraud:        number;
  rule_counts:        Record<string, number>;   // keyed by the rule's reason string
  ml: {
    model:       string;
    n_features:  number;
    importances: MlFeatureImportance[];
  };
}

/** Live stats for the Detection Triggers page: per-rule firing counts + ML importances. */
export async function getTriggerStats(): Promise<TriggerStats> {
  return apiFetch<TriggerStats>("/api/triggers/stats");
}

// ── Export ────────────────────────────────────────────────────────────────────

/**
 * Downloads a privacy-safe CSV of all transactions matching the given filters
 * (mirrors the table view but every matching row, not just the page).
 */
export interface ExportOptions {
  columns?:  string[];          // canonical column keys; omitted = all
  dateFrom?: string;            // YYYY-MM-DD
  dateTo?:   string;            // YYYY-MM-DD
  format?:   "csv" | "xlsx";    // default csv
  pii?:      boolean;           // include decrypted PII (server enforces role)
}

export interface ExportMeta {
  count:    number;
  min_date: string | null;   // YYYY-MM-DD, over filters (ignores date range)
  max_date: string | null;
}

/** Row count (filters + date range) and selectable date window (filters only). */
export async function getExportMeta(
  filters: TransactionFilters = {},
  dates: { dateFrom?: string; dateTo?: string } = {},
): Promise<ExportMeta> {
  const params = new URLSearchParams();
  if (filters.decision) params.set("decision", filters.decision);
  if (filters.reviewed !== undefined) params.set("reviewed", String(filters.reviewed));
  if (filters.search) params.set("search", filters.search);
  if (filters.risk) params.set("risk", filters.risk);
  if (dates.dateFrom) params.set("date_from", dates.dateFrom);
  if (dates.dateTo) params.set("date_to", dates.dateTo);
  return apiFetch<ExportMeta>(`/api/export/transactions/meta?${params.toString()}`);
}

export async function exportTransactions(
  filters: TransactionFilters = {},
  opts: ExportOptions = {},
): Promise<void> {
  const params = new URLSearchParams();
  if (filters.decision) params.set("decision", filters.decision);
  if (filters.reviewed !== undefined) params.set("reviewed", String(filters.reviewed));
  if (filters.search) params.set("search", filters.search);
  if (filters.risk) params.set("risk", filters.risk);
  if (opts.columns && opts.columns.length) params.set("columns", opts.columns.join(","));
  if (opts.dateFrom) params.set("date_from", opts.dateFrom);
  if (opts.dateTo) params.set("date_to", opts.dateTo);
  if (opts.pii) params.set("pii", "true");
  params.set("format", opts.format ?? "csv");

  const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
  const res = await fetch(`${BASE_URL}/api/export/transactions?${params.toString()}`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err?.detail ?? `Export failed (${res.status})`);
  }

  const blob = await res.blob();
  const url  = URL.createObjectURL(blob);
  const cd   = res.headers.get("Content-Disposition");
  const name = cd?.match(/filename="?([^"]+)"?/)?.[1] ?? "transactions.csv";

  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}