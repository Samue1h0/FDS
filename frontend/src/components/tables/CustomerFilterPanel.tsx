"use client";

import { useEffect, useState } from "react";
import { searchCustomers, type CustomerHit } from "@/services/fraudApi";

interface Props {
  selected: string[];                       // selected customer_refs
  onChange: (refs: string[]) => void;
}

// Controls-only customer picker: search by ID, pick from a dropdown, multi-select
// shown as removable chips. Used inside the export modal's docked panel; drives
// both the table filter and the export (selection state lives in the parent).
export default function CustomerFilterPanel({ selected, onChange }: Props) {
  const [query, setQuery]     = useState("");
  const [results, setResults] = useState<CustomerHit[]>([]);
  const [open, setOpen]       = useState(false);

  // Debounced search as the user types.
  useEffect(() => {
    const term = query.trim();
    if (!term) { setResults([]); setOpen(false); return; }
    const id = setTimeout(() => {
      searchCustomers(term)
        .then((hits) => { setResults(hits); setOpen(true); })
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(id);
  }, [query]);

  const add = (ref: string) => {
    if (!selected.includes(ref)) onChange([...selected, ref]);
    setQuery(""); setResults([]); setOpen(false);
  };
  const remove = (ref: string) => onChange(selected.filter((r) => r !== ref));

  const input =
    "w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300";

  return (
    <div>
      <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">Customers</h3>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
        Limit the table and export to specific customers (by ID).
      </p>

      <div className="relative mt-4">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          placeholder="Search customer ID…"
          className={input}
        />
        {open && (
          <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-theme-lg dark:border-gray-700 dark:bg-gray-900">
            {results.length === 0 ? (
              <li className="px-3 py-2 text-sm text-gray-400">No matches</li>
            ) : (
              results.map((hit) => {
                const picked = selected.includes(hit.customer_ref);
                return (
                  <li key={hit.customer_ref}>
                    <button
                      type="button"
                      onClick={() => add(hit.customer_ref)}
                      disabled={picked}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 disabled:opacity-40 dark:hover:bg-white/5"
                    >
                      <span className="font-mono text-gray-700 dark:text-gray-300">{hit.customer_ref}</span>
                      <span className="truncate text-xs text-gray-400">{hit.name ?? ""}</span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        )}
      </div>

      {selected.length > 0 && (
        <div className="mt-3">
          <div className="flex flex-wrap gap-1.5">
            {selected.map((ref) => (
              <span
                key={ref}
                className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-600 dark:bg-brand-500/15 dark:text-brand-400"
              >
                {ref}
                <button type="button" onClick={() => remove(ref)} className="hover:text-brand-800 dark:hover:text-brand-200">
                  ×
                </button>
              </span>
            ))}
          </div>
          <button
            type="button"
            onClick={() => onChange([])}
            className="mt-2 text-xs font-medium text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}
