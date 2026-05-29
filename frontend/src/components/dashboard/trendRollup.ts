import type { FraudTrendEntry } from "@/services/fraudApi";

// Shared trend bucketing + formatting used by both FraudTrendChart and
// PeriodSummary so they always group the snapshot's monthly series the same way.

export type Granularity = "monthly" | "quarterly" | "yearly";

export const GRANULARITIES: Granularity[] = ["monthly", "quarterly", "yearly"];

export const LABELS: Record<Granularity, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
};

// Singular noun for the period, used in copy like "vs last month".
export const PERIOD_NOUN: Record<Granularity, string> = {
  monthly: "month",
  quarterly: "quarter",
  yearly: "year",
};

export interface RolledTrend {
  categories: string[];
  fraud: number[];
  legit: number[];
  amount: number[];
}

// Roll the monthly series (from the snapshot) up to the chosen granularity.
// Entries are "YYYY-MM"; the backend always sends monthly, so quarter/year are
// pure client-side aggregation — no extra fetch.
export function rollup(entries: FraudTrendEntry[], g: Granularity): RolledTrend {
  if (g === "monthly") {
    return {
      categories: entries.map((d) => {
        const [year, month] = d.date.split("-");
        const dt = new Date(parseInt(year), parseInt(month) - 1, 1);
        return dt.toLocaleDateString("en-MY", { month: "short", year: "numeric" });
      }),
      fraud: entries.map((d) => d.fraud),
      legit: entries.map((d) => d.legit),
      amount: entries.map((d) => d.amount_at_risk),
    };
  }

  const map = new Map<string, { fraud: number; legit: number; amount: number }>();
  for (const d of entries) {
    const [year, month] = d.date.split("-");
    const key =
      g === "quarterly"
        ? `${year}-${Math.floor((parseInt(month, 10) - 1) / 3) + 1}`
        : year;
    const cur = map.get(key) ?? { fraud: 0, legit: 0, amount: 0 };
    cur.fraud += d.fraud;
    cur.legit += d.legit;
    cur.amount += d.amount_at_risk;
    map.set(key, cur);
  }
  const keys = [...map.keys()].sort();
  return {
    categories: keys.map((k) =>
      g === "quarterly" ? `Q${k.split("-")[1]} ${k.split("-")[0]}` : k
    ),
    fraud: keys.map((k) => map.get(k)!.fraud),
    legit: keys.map((k) => map.get(k)!.legit),
    amount: keys.map((k) => map.get(k)!.amount),
  };
}

// Compact MYR: 2613334 → "RM 2.6M"
export const compactMYR = (n: number): string => {
  if (n >= 1e9) return `RM ${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `RM ${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `RM ${(n / 1e3).toFixed(1)}K`;
  return `RM ${Math.round(n)}`;
};
