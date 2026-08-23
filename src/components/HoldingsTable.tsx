import type { Holding } from "@/lib/types";
import { formatCurrency, formatNumber, formatPct, classForChange } from "@/lib/format";
import { ChevronRight } from "lucide-react";

interface Props {
  holdings: Holding[];
  baseCurrency: string;
  onSelect?: (h: Holding) => void;
}

export function HoldingsTable({ holdings, baseCurrency, onSelect }: Props) {
  if (holdings.length === 0) {
    return (
      <div className="card p-8 text-center">
        <p className="text-sm text-slate-500 dark:text-slate-400">No open holdings yet. Add a buy transaction or import an XTB statement to get started.</p>
      </div>
    );
  }
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Holdings</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">{holdings.length} positions · click a row for details</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <th className="px-5 py-3">Asset</th>
              <th className="px-3 py-3 text-right">Qty</th>
              <th className="px-3 py-3 text-right">Avg Cost</th>
              <th className="px-3 py-3 text-right">Price</th>
              <th className="px-3 py-3 text-right">Value</th>
              <th className="px-3 py-3 text-right">Day</th>
              <th className="px-3 py-3 text-right">Unrealized P&L</th>
              <th className="px-3 py-3 text-right">Alloc</th>
              <th className="px-3 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {holdings.map((h) => (
              <tr
                key={h.asset.id}
                onClick={() => onSelect?.(h)}
                className="cursor-pointer border-b border-slate-100 transition-colors hover:bg-slate-50 dark:border-slate-800/60 dark:hover:bg-slate-800/40"
              >
                <td className="px-5 py-3">
                  <div className="font-medium text-slate-900 dark:text-slate-100">{h.asset.ticker}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">{h.asset.name || h.asset.exchange}</div>
                </td>
                <td className="px-3 py-3 text-right tabular-nums">{formatNumber(h.quantity, 4)}</td>
                <td className="px-3 py-3 text-right tabular-nums text-slate-500 dark:text-slate-400">{formatCurrency(h.avgCost, h.currency)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{formatCurrency(h.marketPrice, h.currency)}</td>
                <td className="px-3 py-3 text-right font-medium tabular-nums">{formatCurrency(h.marketValue, baseCurrency)}</td>
                <td className={`px-3 py-3 text-right tabular-nums ${classForChange(h.dayChangePct)}`}>{formatPct(h.dayChangePct)}</td>
                <td className={`px-3 py-3 text-right tabular-nums ${classForChange(h.unrealizedPnl)}`}>
                  <div>{formatCurrency(h.unrealizedPnl, baseCurrency)}</div>
                  <div className="text-xs">{formatPct(h.unrealizedPnlPct)}</div>
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-slate-500 dark:text-slate-400">{h.allocationPct.toFixed(1)}%</td>
                <td className="px-3 py-3 text-right text-slate-400"><ChevronRight size={16} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
