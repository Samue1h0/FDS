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
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
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

  // Private enrichment fields (only present on detail endpoint)
  cardholder_name?: string;
  card_expiration_date?: string;
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
  if (filters.limit !== undefined)   params.set("limit", String(filters.limit));
  if (filters.offset !== undefined)  params.set("offset", String(filters.offset));

  const query = params.toString();
  return apiFetch<TransactionListResponse>(
    `/api/transactions${query ? `?${query}` : ""}`
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