import { useMemo, useState } from "react";
import type { Transaction, LotMatch, Asset } from "@/lib/types";
import { computeLots } from "@/lib/portfolio";
import { formatCurrency, formatDate, formatNumber, classForChange } from "@/lib/format";
import { Modal } from "@/components/ui/Modal";
import { GitCompare, ArrowRight, Check } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  transactions: Transaction[];
  lotMatches: LotMatch[];
  portfolioId: string;
  onUnmatch: (matchId: string) => void;
  onReassign: (sellId: string, buyId: string, qty: number, pnl: number) => void;
}

export function LotMatchingModal({ open, onClose, transactions, lotMatches, portfolioId, onUnmatch, onReassign }: Props) {
  const [selectedSell, setSelectedSell] = useState<Transaction | null>(null);
  const [reassignBuyId, setReassignBuyId] = useState<string>("");
  const [reassignQty, setReassignQty] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const txs = useMemo(() => transactions.filter((t) => t.portfolio_id === portfolioId), [transactions, portfolioId]);
  const assetMap = useMemo(() => {
    const m = new Map<string, Asset>();
    for (const t of txs) if (t.asset) m.set(t.asset.id, t.asset);
    return m;
  }, [txs]);

  const sells = useMemo(() => txs.filter((t) => t.type === "SELL").sort((a, b) => b.date.localeCompare(a.date)), [txs]);

  const selectedMatches = useMemo(() => {
    if (!selectedSell) return [];
    return lotMatches.filter((m) => m.sell_transaction_id === selectedSell.id);
  }, [selectedSell, lotMatches]);

  const openLotsForReassign = useMemo(() => {
    if (!selectedSell) return [];
    const lots = computeLots(txs, lotMatches, selectedSell.asset_id);
    return lots.filter((l) => l.remainingQuantity > 0.0001 || l.buyTransaction.id === selectedMatches[0]?.buy_transaction_id);
  }, [selectedSell, txs, lotMatches, selectedMatches]);

  const handleUnmatch = (matchId: string) => {
    onUnmatch(matchId);
  };

  const handleReassign = () => {
    if (!selectedSell || !reassignBuyId) return;
    const qty = Number(reassignQty);
    if (!qty || qty <= 0) return;
    setSaving(true);
    const buyTx = txs.find((t) => t.id === reassignBuyId);
    if (buyTx) {
      const buyCost = Number(buyTx.price) + Number(buyTx.fee) / Number(buyTx.quantity);
      const sellPrice = Number(selectedSell.price) - Number(selectedSell.fee) / Number(selectedSell.quantity);
      const pnl = (sellPrice - buyCost) * qty;
      onReassign(selectedSell.id, reassignBuyId, qty, pnl);
    }
    setReassignBuyId(""); setReassignQty("");
    setSaving(false);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Lot Matching — Specific Lot Identification"
      subtitle="Review FIFO matches and manually re-assign which buy lot a sell closes"
      size="xl"
      footer={<button className="btn-secondary" onClick={onClose}>Done</button>}
    >
      <div className="grid gap-5 lg:grid-cols-2">
        <div>
          <h4 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">Sell Transactions</h4>
          <div className="max-h-96 space-y-2 overflow-y-auto">
            {sells.length === 0 ? (
              <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-400 dark:bg-slate-800/60">No sell transactions yet.</p>
            ) : sells.map((s) => {
              const asset = assetMap.get(s.asset_id!);
              const matched = lotMatches.filter((m) => m.sell_transaction_id === s.id);
              const matchedQty = matched.reduce((sum, m) => sum + Number(m.quantity), 0);
              const fullyMatched = Math.abs(matchedQty - Number(s.quantity)) < 0.001;
              return (
                <button
                  key={s.id}
                  onClick={() => { setSelectedSell(s); setReassignBuyId(""); setReassignQty(String(s.quantity)); }}
                  className={`w-full rounded-lg border p-3 text-left transition-colors ${selectedSell?.id === s.id ? "border-primary-500 bg-primary-50 dark:bg-primary-500/10" : "border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/60"}`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-medium text-slate-900 dark:text-slate-100">{asset?.ticker || "—"}</span>
                      <span className="ml-2 text-xs text-slate-400">{formatDate(s.date, "short")}</span>
                    </div>
                    <span className={`badge ${fullyMatched ? "bg-success-100 text-success-700 dark:bg-success-500/15 dark:text-success-400" : "bg-warning-100 text-warning-700 dark:bg-warning-500/15 dark:text-warning-400"}`}>
                      {fullyMatched ? <><Check size={11} /> Matched</> : "Partial"}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {formatNumber(Number(s.quantity), 4)} @ {formatCurrency(Number(s.price), s.currency)} · matched {formatNumber(matchedQty, 4)}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <h4 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">Matched Lots</h4>
          {!selectedSell ? (
            <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-400 dark:bg-slate-800/60">Select a sell to inspect its matched buy lots.</p>
          ) : (
            <div className="space-y-3">
              <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{assetMap.get(selectedSell.asset_id!)?.ticker}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Sell {formatNumber(Number(selectedSell.quantity), 4)} on {formatDate(selectedSell.date, "medium")} @ {formatCurrency(Number(selectedSell.price), selectedSell.currency)}
                </div>
              </div>

              {selectedMatches.length === 0 ? (
                <p className="rounded-lg bg-warning-50 p-3 text-xs text-warning-700 dark:bg-warning-500/10 dark:text-warning-400">No matches yet. Use FIFO or assign manually below.</p>
              ) : (
                <div className="space-y-2">
                  {selectedMatches.map((m) => {
                    const buyTx = txs.find((t) => t.id === m.buy_transaction_id);
                    return (
                      <div key={m.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                        <div className="flex items-center justify-between text-xs">
                          <span className="badge bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">{m.method}</span>
                          <button onClick={() => handleUnmatch(m.id)} disabled={saving} className="text-error-600 hover:underline dark:text-error-400">Unmatch</button>
                        </div>
                        <div className="mt-2 flex items-center gap-2 text-sm">
                          <span className="text-slate-600 dark:text-slate-400">Buy {formatDate(buyTx?.date || "", "short")}</span>
                          <ArrowRight size={14} className="text-slate-400" />
                          <span className="font-medium">{formatNumber(Number(m.quantity), 4)}</span>
                        </div>
                        <div className={`mt-1 text-xs ${classForChange(Number(m.realized_pnl))}`}>
                          Realized P&L: {formatCurrency(Number(m.realized_pnl), selectedSell.currency)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="rounded-lg border-2 border-dashed border-slate-300 p-3 dark:border-slate-700">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                  <GitCompare size={14} /> Manual assignment
                </div>
                <div className="space-y-2">
                  <select className="input" value={reassignBuyId} onChange={(e) => setReassignBuyId(e.target.value)}>
                    <option value="">Select an open buy lot…</option>
                    {openLotsForReassign.map((l) => (
                      <option key={l.buyTransaction.id} value={l.buyTransaction.id}>
                        {formatDate(l.buyTransaction.date, "short")} · {formatNumber(l.remainingQuantity, 4)} open @ {formatCurrency(Number(l.buyTransaction.price), l.buyTransaction.currency)}
                      </option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <input type="number" step="any" className="input" placeholder="Quantity" value={reassignQty} onChange={(e) => setReassignQty(e.target.value)} />
                    <button className="btn-primary whitespace-nowrap" onClick={handleReassign} disabled={saving || !reassignBuyId}>
                      {saving ? "Saving…" : "Assign"}
                    </button>
                  </div>
                  <p className="text-xs text-slate-400">Re-assigning replaces all current matches for this sell with the chosen buy lot.</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
