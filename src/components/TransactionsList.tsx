import { useState, useMemo } from "react";
import type { Transaction } from "@/lib/types";
import { formatCurrency, formatDate, classForChange } from "@/lib/format";
import { Trash2, Filter, ArrowDownCircle, ArrowUpCircle, DollarSign, Wallet, Coins } from "lucide-react";
import { Modal } from "@/components/ui/Modal";

interface Props {
  transactions: Transaction[];
  portfolioId: string;
  onDeleted: (id: string) => void;
}

const TYPE_ICON: Record<string, typeof ArrowDownCircle> = {
  BUY: ArrowDownCircle, SELL: ArrowUpCircle, DIVIDEND: DollarSign, CASH_IN: Wallet, CASH_OUT: Coins,
};

const TYPE_COLOR: Record<string, string> = {
  BUY: "text-success-600 bg-success-50 dark:bg-success-500/10 dark:text-success-400",
  SELL: "text-error-600 bg-error-50 dark:bg-error-500/10 dark:text-error-400",
  DIVIDEND: "text-primary-600 bg-primary-50 dark:bg-primary-500/10 dark:text-primary-400",
  CASH_IN: "text-accent-600 bg-accent-50 dark:bg-accent-500/10 dark:text-accent-400",
  CASH_OUT: "text-warning-600 bg-warning-50 dark:bg-warning-500/10 dark:text-warning-400",
};

export function TransactionsList({ transactions, portfolioId, onDeleted }: Props) {
  const [filter, setFilter] = useState<string>("ALL");
  const [confirmDelete, setConfirmDelete] = useState<Transaction | null>(null);

  const filtered = useMemo(() => {
    const txs = transactions.filter((t) => t.portfolio_id === portfolioId);
    const sorted = [...txs].sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at));
    return filter === "ALL" ? sorted : sorted.filter((t) => t.type === filter);
  }, [transactions, portfolioId, filter]);

  const handleDelete = () => {
    if (!confirmDelete) return;
    onDeleted(confirmDelete.id);
    setConfirmDelete(null);
  };

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-5 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Transactions</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">{filtered.length} records</p>
        </div>
        <div className="flex items-center gap-2">
          <Filter size={15} className="text-slate-400" />
          <select className="input w-auto" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="ALL">All types</option>
            <option value="BUY">Buys</option>
            <option value="SELL">Sells</option>
            <option value="DIVIDEND">Dividends</option>
            <option value="CASH_IN">Deposits</option>
            <option value="CASH_OUT">Withdrawals</option>
          </select>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <th className="px-5 py-3">Type</th>
              <th className="px-3 py-3">Asset</th>
              <th className="px-3 py-3">Date</th>
              <th className="px-3 py-3 text-right">Qty</th>
              <th className="px-3 py-3 text-right">Price</th>
              <th className="px-3 py-3 text-right">Fee</th>
              <th className="px-3 py-3 text-right">Total</th>
              <th className="px-3 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={8} className="px-5 py-10 text-center text-sm text-slate-400">No transactions yet.</td></tr>
            ) : filtered.map((t) => {
              const Icon = TYPE_ICON[t.type] || DollarSign;
              const total = (t.type === "BUY" || t.type === "SELL") ? Number(t.quantity) * Number(t.price) + Number(t.fee) : Number(t.price);
              return (
                <tr key={t.id} className="border-b border-slate-100 transition-colors hover:bg-slate-50 dark:border-slate-800/60 dark:hover:bg-slate-800/40">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <span className={`rounded-md p-1.5 ${TYPE_COLOR[t.type]}`}><Icon size={14} /></span>
                      <span className="font-medium text-slate-700 dark:text-slate-300">{t.type.replace("_", " ")}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    {t.asset ? (
                      <div>
                        <div className="font-medium text-slate-900 dark:text-slate-100">{t.asset.ticker}</div>
                        <div className="text-xs text-slate-400">{t.asset.exchange}</div>
                      </div>
                    ) : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-3 py-3 text-slate-600 dark:text-slate-400">{formatDate(t.date, "short")}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{t.quantity > 0 ? t.quantity : "—"}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatCurrency(Number(t.price), t.currency)}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-400">{Number(t.fee) > 0 ? formatCurrency(Number(t.fee), t.currency) : "—"}</td>
                  <td className={`px-3 py-3 text-right font-medium tabular-nums ${classForChange(t.type === "SELL" || t.type === "CASH_OUT" ? -total : total)}`}>
                    {formatCurrency(total, t.currency)}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <button onClick={() => setConfirmDelete(t)} className="text-slate-400 transition-colors hover:text-error-600" aria-label="Delete">
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete transaction?"
        size="sm"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setConfirmDelete(null)}>Cancel</button>
            <button className="btn-danger" onClick={handleDelete}>Delete</button>
          </>
        }
      >
        <p className="text-sm text-slate-600 dark:text-slate-300">This will remove the transaction and any lot matches tied to it. This cannot be undone.</p>
      </Modal>
    </div>
  );
}
