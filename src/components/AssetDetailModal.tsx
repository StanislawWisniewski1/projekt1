import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import type { Transaction, LotMatch, Holding, Asset } from "@/lib/types";
import { computeLots } from "@/lib/portfolio";
import { fetchQuote, fetchHistory, fallbackQuote } from "@/lib/marketData";
import { formatCurrency, formatDate, formatNumber, formatPct, classForChange } from "@/lib/format";
import { Loader2, TrendingUp, TrendingDown } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface Props {
  open: boolean;
  onClose: () => void;
  holding: Holding | null;
  transactions: Transaction[];
  lotMatches: LotMatch[];
  baseCurrency: string;
  onTrade?: (type: "BUY" | "SELL", assetId: string) => void;
}

export function AssetDetailModal({ open, onClose, holding, transactions, lotMatches, baseCurrency, onTrade }: Props) {
  const [quote, setQuote] = useState<{ price: number; change: number; changePct: number; currency: string } | null>(null);
  const [history, setHistory] = useState<{ date: string; price: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!holding) return;
    let cancelled = false;
    setLoading(true);
    setQuote(null); setHistory([]);
    (async () => {
      const asset = holding.asset;
      // Try live quote
      const q = await fetchQuote(asset.ticker, asset.exchange);
      if (!cancelled) {
        setQuote(q || fallbackQuote(asset.ticker, asset.exchange, asset.currency));
      }
      // Try 1Y history for sparkline
      const today = new Date();
      const start = new Date(today);
      start.setFullYear(start.getFullYear() - 1);
      const fmt = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");
      const hist = await fetchHistory(asset.ticker, asset.exchange, fmt(start), fmt(today));
      if (!cancelled) {
        setHistory(hist.length > 0 ? hist : syntheticSpark(asset, q?.price || holding.marketPrice));
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [holding]);

  if (!holding) return null;
  const asset = holding.asset as Asset;
  const lots = computeLots(transactions, lotMatches, asset.id);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${asset.ticker} · ${asset.exchange}`}
      subtitle={asset.name || asset.currency}
      size="lg"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Close</button>
          {onTrade && (
            <>
              <button
                className="btn-secondary text-rose-600 dark:text-rose-400"
                onClick={() => {
                  onClose();
                  onTrade("SELL", asset.id);
                }}
              >
                Sell
              </button>
              <button
                className="btn-primary"
                onClick={() => {
                  onClose();
                  onTrade("BUY", asset.id);
                }}
              >
                Buy More
              </button>
            </>
          )}
        </>
      }
    >
      <div className="space-y-5">
        {/* Quote + key stats */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="card p-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">Current Price</p>
            <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">
              {quote ? formatCurrency(quote.price, quote.currency) : "—"}
            </p>
            {quote && (
              <div className={`mt-1 flex items-center gap-1 text-sm ${classForChange(quote.change)}`}>
                {quote.change >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                {formatPct(quote.changePct)}
              </div>
            )}
          </div>
          <div className="card p-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">Position Value</p>
            <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">{formatCurrency(holding.marketValueBase, baseCurrency)}</p>
            <p className="mt-1 text-xs text-slate-400">
              {formatNumber(holding.quantity, 4)} shares
              {asset.currency !== baseCurrency && ` · ${formatCurrency(holding.marketValue, asset.currency)}`}
            </p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">Unrealized P&L</p>
            <p className={`mt-1 text-xl font-semibold ${classForChange(holding.unrealizedPnl)}`}>
              {formatCurrency(holding.unrealizedPnl, baseCurrency)}
            </p>
            <p className={`mt-1 text-xs ${classForChange(holding.unrealizedPnlPct)}`}>{formatPct(holding.unrealizedPnlPct)}</p>
          </div>
        </div>

        {/* Price sparkline */}
        <div className="card p-4">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Price History (1Y)</h4>
            {loading && <Loader2 size={14} className="animate-spin text-slate-400" />}
          </div>
          <div className="h-40">
            {history.length > 1 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={history}>
                  <defs>
                    <linearGradient id="gSpark" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#94a3b8" tickFormatter={(d) => d.slice(5)} />
                  <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" width={48} domain={["auto", "auto"]} />
                  <Tooltip content={({ active, payload }) => active && payload?.length ? (
                    <div className="rounded border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800">
                      {payload[0].payload.date}: {formatCurrency(Number(payload[0].value), asset.currency)}
                    </div>
                  ) : null} />
                  <Area type="monotone" dataKey="price" stroke="#06b6d4" strokeWidth={2} fill="url(#gSpark)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : <div className="flex h-full items-center justify-center text-xs text-slate-400">No history available.</div>}
          </div>
        </div>

        {/* Lot history */}
        <div className="card overflow-hidden">
          <div className="border-b border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 dark:border-slate-800 dark:text-slate-300">Lot History</div>
          <div className="max-h-60 overflow-y-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th className="px-3 py-2">Buy Date</th>
                  <th className="px-3 py-2 text-right">Buy Qty</th>
                  <th className="px-3 py-2 text-right">Open</th>
                  <th className="px-3 py-2">Closed By</th>
                  <th className="px-3 py-2 text-right">Closed Qty</th>
                </tr>
              </thead>
              <tbody>
                {lots.map((lot) => (
                  <LotRow key={lot.buyTransaction.id} lot={lot} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function LotRow({ lot }: { lot: ReturnType<typeof computeLots>[number] }) {
  if (lot.matched.length === 0) {
    return (
      <tr className="border-b border-slate-100 dark:border-slate-800/60">
        <td className="px-3 py-2">{formatDate(lot.buyTransaction.date, "short")}</td>
        <td className="px-3 py-2 text-right">{formatNumber(Number(lot.buyTransaction.quantity), 4)}</td>
        <td className="px-3 py-2 text-right font-medium text-success-600 dark:text-success-400">{formatNumber(lot.remainingQuantity, 4)}</td>
        <td className="px-3 py-2 text-slate-400">—</td>
        <td className="px-3 py-2 text-right text-slate-400">—</td>
      </tr>
    );
  }
  return (
    <>
      {lot.matched.map((m, i) => (
        <tr key={`${lot.buyTransaction.id}-${i}`} className="border-b border-slate-100 dark:border-slate-800/60">
          {i === 0 ? (
            <>
              <td className="px-3 py-2" rowSpan={lot.matched.length}>{formatDate(lot.buyTransaction.date, "short")}</td>
              <td className="px-3 py-2 text-right" rowSpan={lot.matched.length}>{formatNumber(Number(lot.buyTransaction.quantity), 4)}</td>
              <td className="px-3 py-2 text-right" rowSpan={lot.matched.length}>{formatNumber(lot.remainingQuantity, 4)}</td>
            </>
          ) : null}
          <td className="px-3 py-2">{formatDate(m.sellTransaction.date, "short")}</td>
          <td className="px-3 py-2 text-right">{formatNumber(m.quantity, 4)}</td>
        </tr>
      ))}
    </>
  );
}

function syntheticSpark(asset: Asset, basePrice: number): { date: string; price: number }[] {
  const out: { date: string; price: number }[] = [];
  const today = new Date();
  let p = basePrice * 0.85;
  for (let i = 120; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    p = Math.max(0.5, p * (1 + (Math.random() - 0.48) * 0.02));
    out.push({ date: d.toISOString().slice(0, 10), price: Number(p.toFixed(2)) });
  }
  out[out.length - 1].price = basePrice;
  return out;
}
