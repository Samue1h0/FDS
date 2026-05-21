// Static definitions for the 9 rule-engine checks shown on the Detection
// Triggers page. Descriptions/conditions mirror backend/src/rule_engine.py and
// rarely change; live "times fired" counts are merged in at runtime by matching
// `reasonKeys` against TriggerStats.rule_counts (the strings stored in
// private_transactions.risk_reasons).

export type RuleTheme = "spending" | "velocity" | "profile";

export interface RuleDef {
  id:          string;
  name:        string;
  theme:       RuleTheme;
  description: string;   // plain-English purpose
  condition:   string;   // the real trigger threshold
  reasonKeys:  string[]; // reason string(s) this rule emits into risk_reasons
}

export const THEME_META: Record<
  RuleTheme,
  { label: string; tag: string; bar: string; dot: string }
> = {
  spending: {
    label: "Spending",
    tag:   "bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400",
    bar:   "bg-blue-500",
    dot:   "bg-blue-500",
  },
  velocity: {
    label: "Velocity",
    tag:   "bg-purple-50 text-purple-600 dark:bg-purple-500/15 dark:text-purple-400",
    bar:   "bg-purple-500",
    dot:   "bg-purple-500",
  },
  profile: {
    label: "Profile",
    tag:   "bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400",
    bar:   "bg-amber-500",
    dot:   "bg-amber-500",
  },
};

export const RULES: RuleDef[] = [
  {
    id:          "unusual_merchant",
    name:        "Unusual merchant category",
    theme:       "spending",
    description: "A charge with a merchant category the customer hasn't used recently, when they already shop across many categories and the amount is high.",
    condition:   "New category (last 15 days) · ≥ 5 prior merchants · amount > max(RM 250, 2.5× avg spend)",
    reasonKeys:  ["Unusual merchant category"],
  },
  {
    id:          "high_value",
    name:        "High-value transaction",
    theme:       "spending",
    description: "A charge far above the customer's usual spending level.",
    condition:   "amount > max(RM 500, 5× customer average spend)",
    reasonKeys:  ["High-value transaction"],
  },
  {
    id:          "repeated_small",
    name:        "Repeated small transactions",
    theme:       "velocity",
    description: "A burst of tiny charges in a short window — a classic card-testing pattern.",
    condition:   "> 3 charges ≤ RM 10 within a 15-minute window",
    reasonKeys:  ["Repeated small transactions"],
  },
  {
    id:          "cross_location",
    name:        "Rapid cross-location",
    theme:       "velocity",
    description: "Charges in two different cities too close together to be physically plausible.",
    condition:   "Different city from the last transaction within 30 minutes",
    reasonKeys:  ["Rapid cross-location transaction"],
  },
  {
    id:          "income_mismatch",
    name:        "Exceeds income capacity",
    theme:       "profile",
    description: "Spending beyond the customer's stated income ceiling.",
    condition:   "amount > 1.2× income ceiling (excludes self-employed)",
    reasonKeys:  ["Exceeds expected income capacity"],
  },
  {
    id:          "student_high_spend",
    name:        "Student high-spend",
    theme:       "profile",
    description: "A large purchase on a profile flagged as a student, who is expected to have lower capacity.",
    condition:   "Employment = Student · amount > RM 3,000",
    reasonKeys:  ["High-value transaction for student profile"],
  },
  {
    id:          "unknown_income",
    name:        "Unknown income (unemployed)",
    theme:       "profile",
    description: "A large charge from an unemployed customer with no income on file.",
    condition:   "Employment = Unemployed · income unknown · amount > RM 5,000",
    reasonKeys:  ["High-value transaction with unknown income"],
  },
  {
    id:          "retiree_high_value",
    name:        "Retiree high-value",
    theme:       "profile",
    description: "A large charge from a retiree with no income on file — a higher tolerance allows for savings.",
    condition:   "Employment = Retired · income unknown · amount > RM 10,000",
    reasonKeys:  ["High-value transaction (retiree) with unknown income"],
  },
  {
    id:          "self_employed_high_value",
    name:        "Self-employed high-value",
    theme:       "profile",
    description: "An abnormally large charge for a self-employed profile, escalated for extreme amounts.",
    condition:   "Self-Employed · amount > RM 20,000 and > 2× income (very high if also > RM 50,000)",
    reasonKeys:  [
      "Unusually high transaction for self-employed profile",
      "Very high transaction for self-employed profile",
    ],
  },
];
