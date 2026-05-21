import { RuleDef, THEME_META } from "./ruleConfig";

interface RuleCardProps {
  rule:  RuleDef;
  count: number | null;   // null while stats are loading
}

export default function RuleCard({ rule, count }: RuleCardProps) {
  const theme = THEME_META[rule.theme];

  return (
    <div className="flex h-full flex-col rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="mb-3 flex items-start justify-between gap-3">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${theme.tag}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${theme.dot}`} />
          {theme.label}
        </span>
        <span className="text-right">
          <span className="block text-lg font-semibold text-gray-800 dark:text-white/90">
            {count === null ? "—" : count.toLocaleString()}
          </span>
          <span className="block text-[11px] uppercase tracking-wide text-gray-400">
            times fired
          </span>
        </span>
      </div>

      <h3 className="mb-1 text-base font-semibold text-gray-800 dark:text-white/90">
        {rule.name}
      </h3>
      <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
        {rule.description}
      </p>

      <div className="mt-auto rounded-lg bg-gray-50 px-3 py-2 dark:bg-white/[0.03]">
        <span className="block text-[11px] font-medium uppercase tracking-wide text-gray-400">
          Triggers when
        </span>
        <code className="block text-xs text-gray-600 dark:text-gray-300">
          {rule.condition}
        </code>
      </div>
    </div>
  );
}
