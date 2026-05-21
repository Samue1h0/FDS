import { RULES, THEME_META, RuleTheme } from "./ruleConfig";
import RuleCard from "./RuleCard";

interface RuleEngineSectionProps {
  ruleCounts: Record<string, number> | null;   // null while loading
}

function countFor(reasonKeys: string[], counts: Record<string, number> | null): number | null {
  if (counts === null) return null;
  return reasonKeys.reduce((sum, key) => sum + (counts[key] ?? 0), 0);
}

export default function RuleEngineSection({ ruleCounts }: RuleEngineSectionProps) {
  return (
    <section>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            Rule Engine
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Deterministic checks against the customer&apos;s own history and KYC profile. Each
            triggered rule adds weight to the final fraud score.
          </p>
        </div>
        <div className="flex items-center gap-4">
          {(Object.keys(THEME_META) as RuleTheme[]).map((t) => (
            <span key={t} className="inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
              <span className={`h-2 w-2 rounded-full ${THEME_META[t].dot}`} />
              {THEME_META[t].label}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {RULES.map((rule) => (
          <RuleCard key={rule.id} rule={rule} count={countFor(rule.reasonKeys, ruleCounts)} />
        ))}
      </div>
    </section>
  );
}
