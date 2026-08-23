import { useEffect, useMemo, useState } from "react";
import {
  Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend,
} from "recharts";
import type { Transaction, PortfolioSnapshot } from "@/lib/types";
import { computePortfolioSnapshots, timeRangeToDates, clearAppliedFlags } from "@/lib/portfolio";
import { fetchBulkHistory, generateSyntheticHistory } from "@/lib/marketData";
import type { Asset } from "@/lib/types";
import { useToast } from "@/components/ui/ToastContext";
import { Loader2 } from "lucide-react";

type Range = "1M" | "6M" | "YTD" | "1Y" | "ALL";

interface Props {
  transactions: Transaction[];
  assets: Asset[];
  baseCurrency: string;
  portfolioId: string;
}

export function PerformanceChart({ transactions, assets, baseCurrency, portfolioId }: Props) {
  const [range, setRange] = useState<Range>("1Y");
  const [metric, setMetric] = useState<"value" | "twr">("value");
  const [snapshots, setSnapshots] = useState<PortfolioSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const { pushToast } = useToast();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const txs = transactions.filter((t) => t.portfolio_id === portfolioId);
      const { start, end } = timeRangeToDates(range);
      // Determine earliest transaction date so synthetic history covers from there
      const earliestTx = txs.reduce((min, t) => (t.date < min ? t.date : min), end);
      const effectiveStart = start < earliestTx ? start : earliestTx;

      // Build price history map: assetId -> { date -> price_in_base }
      const priceHistory = new Map<string, Map<string, number>>();
      const txAssets = Array.from(new Set(txs.map((t) => t.asset_id).filter(Boolean) as string[]));
      const assetLookup = new Map(assets.map((a) => [a.id, a]));
      const assetInputs = txAssets
        .map((id) => assetLookup.get(id))
        .filter((a): a is Asset => !!a);

      let useFallback = false;
      if (assetInputs.length > 0) {
        try {
          const startFmt = effectiveStart.replace(/-/g, "");
          const endFmt = end.replace(/-/g, "");
          const bulk = await fetchBulkHistory(
            assetInputs.map((a) => ({ asset_id: a.id, ticker: a.ticker, exchange: a.exchange, currency: a.currency })),
            startFmt,
            endFmt,
            baseCurrency,
          );
          let anyData = false;
          for (const a of assetInputs) {
            const arr = bulk[a.id] || [];
            if (arr.length > 0) anyData = true;
            const m = new Map<string, number>();
            for (const p of arr) m.set(p.date, p.price_base);
            priceHistory.set(a.id, m);
          }
          if (!anyData) useFallback = true;
        } catch {
          useFallback = true;
        }
      }

      if (useFallback) {
        // synthetic history based on last known price
        const days = Math.ceil((new Date(end).getTime() - new Date(effectiveStart).getTime()) / 86400000) + 1;
        for (const a of assetInputs) {
          const fb = a.currency === baseCurrency ? 50 : 50;
          const hist = generateSyntheticHistory(a, fb, Math.min(days, 400), baseCurrency);
          const m = new Map<string, number>();
          for (const p of hist) m.set(p.date, p.price_base);
          priceHistory.set(a.id, m);
        }
        if (assetInputs.length === 0) {
          pushToast("info", "No holdings yet — add a position to see performance.");
        } else {
          pushToast("info", "Live market data unavailable; showing simulated price history for preview.");
        }
      }

      clearAppliedFlags(txs);
      const snaps = computePortfolioSnapshots(txs, priceHistory, baseCurrency, effectiveStart, end);
      if (!cancelled) setSnapshots(snaps);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [transactions, portfolioId, range, baseCurrency, assets, pushToast]);

  const chartData = useMemo(() => snapshots.map((s) => ({
    date: s.date,
    value: Number(s.totalValue.toFixed(2)),
    twr: Number(s.twr.toFixed(2)),
  })), [snapshots]);

  const currentValue = snapshots.length > 0 ? snapshots[snapshots.length - 1].totalValue : 0;
  const startValue = snapshots.length > 0 ? snapshots[0].totalValue : 0;
  const periodChange = currentValue - startValue;
  const periodChangePct = startValue > 0 ? (periodChange / startValue) * 100 : 0;

  return (
    <div className="card p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Portfolio Performance</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {loading ? "Loading…" : `${chartData.length} days · ${periodChange >= 0 ? "+" : ""}${periodChange.toFixed(2)} ${baseCurrency} (${periodChangePct >= 0 ? "+" : ""}${periodChangePct.toFixed(2)}%)`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-800">
            {(["value", "twr"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMetric(m)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${metric === m ? "bg-primary-600 text-white" : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"}`}
              >
                {m === "value" ? "Total Value" : "TWR Return %"}
              </button>
            ))}
          </div>
          <div className="inline-flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-800">
            {(["1M", "6M", "YTD", "1Y", "ALL"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${range === r ? "bg-primary-600 text-white" : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"}`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-5 h-72">
        {loading ? (
          <div className="flex h-full items-center justify-center text-slate-400">
            <Loader2 className="animate-spin" size={24} />
          </div>
        ) : chartData.length < 2 ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">
            Not enough data to chart yet.
          </div>
        ) : metric === "value" ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 5, right: 8, left: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="gValue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:stroke-slate-800" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#94a3b8" tickFormatter={(d) => d.slice(5)} />
              <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" width={56} tickFormatter={(v) => `${(v / 1000).toFixed(1)}k`} />
              <Tooltip content={<ChartTooltip currency={baseCurrency} />} />
              <Area type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} fill="url(#gValue)" />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:stroke-slate-800" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#94a3b8" tickFormatter={(d) => d.slice(5)} />
              <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" width={56} tickFormatter={(v) => `${v.toFixed(1)}%`} />
              <Tooltip content={<ChartTooltip currency={baseCurrency} twr />} />
              <Line type="monotone" dataKey="twr" stroke="#10b981" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function ChartTooltip({ active, payload, currency, twr }: { active?: boolean; payload?: { value: number; payload: { date: string } }[]; currency: string; twr?: boolean }) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0];
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md dark:border-slate-700 dark:bg-slate-800">
      <div className="font-medium text-slate-500 dark:text-slate-400">{p.payload.date}</div>
      <div className="mt-1 font-semibold text-slate-900 dark:text-slate-100">
        {twr ? `${p.value >= 0 ? "+" : ""}${p.value.toFixed(2)}%` : `${currency} ${p.value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`}
      </div>
    </div>
  );
}
