"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import {
  getModelPerformance,
  type ConfusionMatrix,
  type ModelPerformance,
} from "@/services/fraudApi";

interface Props {
  isOpen:  boolean;
  onClose: () => void;
}

type Tab = "test" | "live";

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

/** A metric tile with its formal name, value, and a plain-English gloss. */
function MetricCard({
  label, value, hint, accent = false,
}: { label: string; value: string; hint: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${
      accent
        ? "border-brand-200 bg-brand-50 dark:border-brand-500/30 dark:bg-brand-500/10"
        : "border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"
    }`}>
      <div className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${
        accent ? "text-brand-600 dark:text-brand-400" : "text-gray-800 dark:text-white/90"
      }`}>{value}</div>
      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{hint}</div>
    </div>
  );
}

/** 2×2 confusion matrix laid out with actual on rows, predicted on columns. */
function ConfusionMatrixGrid({ cm }: { cm: ConfusionMatrix }) {
  const cell = (n: number, label: string, good: boolean) => (
    <div className={`flex flex-col items-center justify-center rounded-lg p-4 ${
      good
        ? "bg-success-50 dark:bg-success-500/10"
        : "bg-error-50 dark:bg-error-500/10"
    }`}>
      <span className={`text-2xl font-bold ${
        good ? "text-success-600 dark:text-success-400" : "text-error-600 dark:text-error-400"
      }`}>{n.toLocaleString()}</span>
      <span className="mt-0.5 text-center text-[11px] leading-tight text-gray-500 dark:text-gray-400">{label}</span>
    </div>
  );

  return (
    <div>
      <div className="grid grid-cols-[auto_1fr_1fr] gap-2 text-xs">
        <div />
        <div className="pb-1 text-center font-medium text-gray-500 dark:text-gray-400">Predicted Fraud</div>
        <div className="pb-1 text-center font-medium text-gray-500 dark:text-gray-400">Predicted Legit</div>

        <div className="flex items-center justify-end pr-2 font-medium text-gray-500 dark:text-gray-400">Actual&nbsp;Fraud</div>
        {cell(cm.tp, "True Positive", true)}
        {cell(cm.fn, "False Negative — missed fraud", false)}

        <div className="flex items-center justify-end pr-2 font-medium text-gray-500 dark:text-gray-400">Actual&nbsp;Legit</div>
        {cell(cm.fp, "False Positive — false alarm", false)}
        {cell(cm.tn, "True Negative", true)}
      </div>
    </div>
  );
}

function MetricsPanel({
  cm, accuracy, precision, recall, f1, fpr, rocAuc, positives, negatives,
}: {
  cm: ConfusionMatrix;
  accuracy: number; precision: number; recall: number; f1: number; fpr: number;
  rocAuc?: number; positives: number; negatives: number;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div>
        <h4 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">Confusion matrix</h4>
        <ConfusionMatrixGrid cm={cm} />
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          {positives.toLocaleString()} actual fraud · {negatives.toLocaleString()} actual legit
          {" "}({((positives / (positives + negatives)) * 100).toFixed(1)}% fraud prevalence)
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 self-start sm:grid-cols-3 lg:grid-cols-2">
        <MetricCard accent label="Recall" value={pct(recall)}
          hint="of all real fraud, share caught" />
        <MetricCard accent label="Precision" value={pct(precision)}
          hint="of fraud flags, share correct" />
        <MetricCard label="F1 score" value={pct(f1)}
          hint="harmonic mean of the two" />
        <MetricCard label="False positive rate" value={pct(fpr)}
          hint="legit txns wrongly flagged" />
        {rocAuc !== undefined && (
          <MetricCard label="ROC-AUC" value={rocAuc.toFixed(3)}
            hint="ranking quality (1.0 = perfect)" />
        )}
        <MetricCard label="Accuracy" value={pct(accuracy)}
          hint="overall — inflated by imbalance" />
      </div>
    </div>
  );
}

export default function ModelPerformanceModal({ isOpen, onClose }: Props) {
  const [data, setData]   = useState<ModelPerformance | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab]     = useState<Tab>("test");

  useEffect(() => {
    if (!isOpen) return;
    setData(null);
    setError(null);
    let active = true;
    getModelPerformance()
      .then((d) => { if (active) { setData(d); setTab(d.test ? "test" : "live"); } })
      .catch((e) => { if (active) setError(e instanceof Error ? e.message : "Failed to load performance"); });
    return () => { active = false; };
  }, [isOpen]);

  const test = data?.test ?? null;
  const live = data?.live ?? null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-4xl m-4">
      <div className="max-h-[85vh] overflow-y-auto rounded-3xl bg-white p-6 dark:bg-gray-900 sm:p-8">
        <header className="mb-5">
          <h3 className="text-xl font-bold text-gray-800 dark:text-white/90">Detection-Model Performance</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            How the Random Forest classifier performs at separating fraud from legitimate
            transactions. Fraud is rare, so read <span className="font-medium">recall</span> and{" "}
            <span className="font-medium">precision</span> over raw accuracy.
          </p>
        </header>

        {error && (
          <p className="rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400">
            {error}
          </p>
        )}

        {!data && !error && (
          <div className="flex h-64 animate-pulse items-center justify-center rounded-xl bg-gray-50 text-sm text-gray-400 dark:bg-white/[0.03]">
            Loading metrics…
          </div>
        )}

        {data && (
          <>
            {/* Tabs */}
            <div className="mb-5 flex gap-1 rounded-lg bg-gray-100 p-1 dark:bg-white/[0.05]">
              <button
                onClick={() => setTab("test")}
                disabled={!test}
                className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition disabled:opacity-40 ${
                  tab === "test"
                    ? "bg-white text-gray-800 shadow-sm dark:bg-gray-800 dark:text-white"
                    : "text-gray-500 hover:text-gray-700 dark:text-gray-400"
                }`}
              >
                Held-out test set
              </button>
              <button
                onClick={() => setTab("live")}
                className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
                  tab === "live"
                    ? "bg-white text-gray-800 shadow-sm dark:bg-gray-800 dark:text-white"
                    : "text-gray-500 hover:text-gray-700 dark:text-gray-400"
                }`}
              >
                Live (current data)
              </button>
            </div>

            {tab === "test" && test && (
              <div className="space-y-4">
                <MetricsPanel
                  cm={test.confusion_matrix}
                  accuracy={test.accuracy} precision={test.precision} recall={test.recall}
                  f1={test.f1} fpr={test.fpr} rocAuc={test.roc_auc}
                  positives={test.positives} negatives={test.negatives}
                />
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-xs leading-relaxed text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
                  <span className="font-semibold text-gray-700 dark:text-gray-300">Methodology — </span>
                  {test.methodology} Trained on {test.train_size.toLocaleString()} transactions,
                  evaluated on {test.test_size.toLocaleString()} ({test.n_estimators} trees,{" "}
                  {test.n_features} features, <code>class_weight={test.class_weight}</code>).
                  With only {test.positives} fraud cases in the test fold, precision/recall carry
                  meaningful variance — the ROC-AUC ({test.roc_auc.toFixed(3)}) is the more stable
                  summary. Regenerate with <code>python -m src.eval_model</code>.
                </div>
              </div>
            )}

            {tab === "test" && !test && (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No held-out evaluation found. Run <code>python -m src.eval_model</code> in the
                backend to generate <code>models/model_metrics.json</code>.
              </p>
            )}

            {tab === "live" && live && (
              <div className="space-y-4">
                <MetricsPanel
                  cm={live.confusion_matrix}
                  accuracy={live.accuracy} precision={live.precision} recall={live.recall}
                  f1={live.f1} fpr={live.fpr}
                  positives={live.positives} negatives={live.negatives}
                />
                <div className="rounded-xl border border-warning-200 bg-warning-50 p-4 text-xs leading-relaxed text-warning-700 dark:border-warning-500/30 dark:bg-warning-500/10 dark:text-warning-300">
                  <span className="font-semibold">Read with care — </span>
                  these reflect the model&apos;s prediction vs. ground truth across all{" "}
                  {live.n_scored.toLocaleString()} scored transactions currently in the system.
                  Because the model was trained on most of this data, these figures run higher than
                  the held-out test set and are <span className="font-medium">not</span> a
                  generalization estimate. No ROC-AUC here — the per-transaction ML probability
                  isn&apos;t persisted.
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
