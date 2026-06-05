"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  getFrozenCards,
  type FrozenCard,
  type FrozenCardsResponse,
} from "@/services/fraudApi";
import { useLive } from "@/context/LiveContext";
import FrozenCardsStats from "./FrozenCardsStats";
import FrozenCardsTable from "./FrozenCardsTable";
import FrozenCardDetailModal from "./FrozenCardDetailModal";
import Pagination from "@/components/tables/Pagination";

const PAGE_SIZE = 7;

export default function FrozenCardsClient() {
  const [data, setData] = useState<FrozenCardsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<FrozenCard | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);

  // Live updates: every SSE event (new scored txn / freeze / review) bumps
  // lastUpdated, which we use to silently re-pull the frozen-cards list.
  const { lastUpdated } = useLive();

  const fetchCards = useCallback(async (silent: boolean) => {
    if (!silent) setLoading(true);
    try {
      const d = await getFrozenCards();
      setData(d);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load frozen cards");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // Initial load (with spinner).
  useEffect(() => { fetchCards(false); }, [fetchCards]);

  // Live refresh on each SSE event — silent so the table/search/page don't flicker.
  // Skip the first run; the mount effect above already covers it.
  const firstLive = useRef(true);
  useEffect(() => {
    if (firstLive.current) { firstLive.current = false; return; }
    fetchCards(true);
  }, [lastUpdated, fetchCards]);

  const openCard = (c: FrozenCard) => {
    setSelected(c);
    setModalOpen(true);
  };

  const allCards = data?.cards ?? [];
  const q = query.trim().toLowerCase();
  const filtered = q
    ? allCards.filter((c) => c.customer_ref.toLowerCase().includes(q))
    : allCards;

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const pageCards = filtered.slice(start, start + PAGE_SIZE);

  // Autocomplete suggestions: frozen cards' own customer IDs matching the query.
  const suggestions = q
    ? Array.from(new Set(allCards.map((c) => c.customer_ref)))
        .filter((ref) => ref.toLowerCase().includes(q) && ref.toLowerCase() !== q)
        .slice(0, 8)
    : [];

  const pickCustomer = (ref: string) => {
    setQuery(ref);
    setPage(1);
    setOpen(false);
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white/90 sm:text-3xl">
          Frozen Cards
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
          Cards automatically frozen after a fraudulent transaction. Click a card to see its full
          transaction history and where the freeze was triggered.
        </p>
      </header>

      {error && (
        <p className="rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400">
          {error} — is the backend running?
        </p>
      )}

      <FrozenCardsStats summary={data?.summary ?? null} />

      {loading ? (
        <p className="py-10 text-center text-sm text-gray-400">Loading frozen cards…</p>
      ) : (
        <div className="space-y-4">
          {/* Search by customer ID */}
          <div className="flex items-center justify-between gap-3">
            <div className="relative w-full max-w-xs">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <circle cx="9" cy="9" r="6" />
                  <path d="m14 14 3 3" strokeLinecap="round" />
                </svg>
              </span>
              <input
                type="text"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setPage(1); setOpen(true); }}
                onFocus={() => setOpen(true)}
                onBlur={() => setTimeout(() => setOpen(false), 120)}
                placeholder="Search customer ID…"
                className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
              />
              {open && suggestions.length > 0 && (
                <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-theme-lg dark:border-gray-700 dark:bg-gray-900">
                  {suggestions.map((ref) => (
                    <li key={ref}>
                      <button
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); pickCustomer(ref); }}
                        className="flex w-full items-center px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-white/5"
                      >
                        <span className="font-mono text-gray-700 dark:text-gray-300">{ref}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <span className="shrink-0 text-sm text-gray-500 dark:text-gray-400">
              {filtered.length} card{filtered.length === 1 ? "" : "s"}
            </span>
          </div>

          {q && filtered.length === 0 ? (
            <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-400 dark:border-gray-800 dark:bg-white/[0.03]">
              No frozen cards match “{query.trim()}”.
            </div>
          ) : (
            <FrozenCardsTable cards={pageCards} onSelect={openCard} />
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-gray-500 dark:text-gray-400">
                Showing {start + 1}–{Math.min(start + PAGE_SIZE, filtered.length)} of {filtered.length}
              </span>
              <Pagination currentPage={safePage} totalPages={totalPages} onPageChange={setPage} />
            </div>
          )}
        </div>
      )}

      <FrozenCardDetailModal
        card={selected}
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
}
