"use client";
import { useEffect, useState } from "react";
import {
  getFrozenCards,
  type FrozenCard,
  type FrozenCardsResponse,
} from "@/services/fraudApi";
import FrozenCardsStats from "./FrozenCardsStats";
import FrozenCardsTable from "./FrozenCardsTable";
import FrozenCardDetailModal from "./FrozenCardDetailModal";

export default function FrozenCardsClient() {
  const [data, setData] = useState<FrozenCardsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<FrozenCard | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    let active = true;
    getFrozenCards()
      .then((d) => { if (active) { setData(d); setError(null); } })
      .catch((e) => { if (active) setError(e instanceof Error ? e.message : "Failed to load frozen cards"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const openCard = (c: FrozenCard) => {
    setSelected(c);
    setModalOpen(true);
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
        <FrozenCardsTable cards={data?.cards ?? []} onSelect={openCard} />
      )}

      <FrozenCardDetailModal
        card={selected}
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
}
