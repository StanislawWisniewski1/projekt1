import { useState, useRef } from "react";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/ToastContext";
import { parseXtbFile, runFifoMatching, sampleXtbCsv, type ParsedXtbRow, type FifoMatch } from "@/lib/xtbImport";
import type { Portfolio, Asset, Transaction, LotMatch, TransactionType } from "@/lib/types";
import { Upload, FileSpreadsheet, Download, Check, GitCompare } from "lucide-react";
import { formatDate, formatCurrency, classForChange } from "@/lib/format";

interface Props {
  open: boolean;
  onClose: () => void;
  portfolio: Portfolio;
  assets: Asset[];
  onImport: (
    newAssets: { ticker: string; exchange: string; currency: string; name: string; type: string }[],
    transactions: Omit<Transaction, "id" | "created_at" | "asset">[],
    lotMatches: Omit<LotMatch, "id" | "created_at">[],
  ) => void;
}

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function XtbImportModal({ open, onClose, portfolio, assets, onImport }: Props) {
  const { pushToast } = useToast();
  const [parsed, setParsed] = useState<ParsedXtbRow[] | null>(null);
  const [skipped, setSkipped] = useState<{ reason: string; raw: Record<string, string> }[]>([]);
  const [matches, setMatches] = useState<FifoMatch[]>([]);
  const [fileName, setFileName] = useState("");
  const [showMatches, setShowMatches] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => { setParsed(null); setSkipped([]); setMatches([]); setFileName(""); setShowMatches(false); };

  const handleFile = async (file: File) => {
    setFileName(file.name);
    try {
      const result = await parseXtbFile(file);
      setParsed(result.rows);
      setSkipped(result.skipped);
      const fifo = runFifoMatching(result.rows);
      setMatches(fifo);
      if (result.rows.length === 0) {
        pushToast("warning", "No stock/ETF rows found. Check the file format or download the sample.");
      } else {
        pushToast("success", `Parsed ${result.rows.length} trades${result.skipped.length > 0 ? `, skipped ${result.skipped.length}` : ""}.`);
      }
    } catch (err) {
      pushToast("error", `Failed to parse: ${(err as Error).message}`);
    }
  };

  const downloadSample = () => {
    const blob = new Blob([sampleXtbCsv()], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "xtb_sample_statement.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    if (!parsed) return;
    // 1. Build asset dedup map
    const existingKey = new Set(assets.map((a) => `${a.ticker}|${a.exchange}`));
    const newAssets: { ticker: string; exchange: string; currency: string; name: string; type: string }[] = [];
    for (const row of parsed) {
      if (row.type === "CASH_IN" || row.type === "CASH_OUT") continue;
      const key = `${row.ticker}|${row.exchange}`;
      if (!existingKey.has(key) && !newAssets.some((na) => `${na.ticker}|${na.exchange}` === key)) {
        newAssets.push({ ticker: row.ticker, exchange: row.exchange, currency: row.currency, name: row.name || row.ticker, type: "stock" });
      }
    }

    // 2. Build transactions with temp IDs for matching
    const tempAssetIds = new Map<string, string>();
    for (const na of newAssets) tempAssetIds.set(`${na.ticker}|${na.exchange}`, uid());

    const txRows: (Omit<Transaction, "id" | "created_at" | "asset"> & { _tempId: string })[] = [];
    for (const row of parsed) {
      const key = `${row.ticker}|${row.exchange}`;
      const assetId = row.type === "CASH_IN" || row.type === "CASH_OUT" ? null : tempAssetIds.get(key) || assets.find((a) => `${a.ticker}|${a.exchange}` === key)?.id || null;
      txRows.push({
        _tempId: uid(),
        portfolio_id: portfolio.id,
        asset_id: assetId,
        type: row.type as TransactionType,
        date: row.date,
        quantity: row.quantity,
        price: row.price,
        fee: row.fee,
        currency: row.currency,
        note: row.note,
      });
    }

    // 3. Build lot matches using temp IDs
    const txBySig = new Map<string, string>();
    for (const tx of txRows) {
      txBySig.set(`${tx.type}|${tx.date}|${tx.quantity}|${tx.price}|${tx.asset_id ?? "cash"}`, tx._tempId);
    }
    const sigOf = (r: ParsedXtbRow) => `${r.type}|${r.date}|${r.quantity}|${r.price}|${r.type === "CASH_IN" || r.type === "CASH_OUT" ? "cash" : tempAssetIds.get(`${r.ticker}|${r.exchange}`) ?? "cash"}`;
    const lotRows: Omit<LotMatch, "id" | "created_at">[] = [];
    for (const m of matches) {
      const buyId = txBySig.get(sigOf(m.buyRow));
      const sellId = txBySig.get(sigOf(m.sellRow));
      if (buyId && sellId) {
        lotRows.push({ sell_transaction_id: sellId, buy_transaction_id: buyId, quantity: m.quantity, realized_pnl: m.realizedPnl, method: "FIFO" });
      }
    }

    const cleanTx = txRows.map(({ _tempId, ...rest }) => rest);
    onImport(newAssets, cleanTx, lotRows);
    reset();
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={() => { reset(); onClose(); }}
      title="Import XTB Broker Statement"
      subtitle="CSV or XLSX · stocks and ETFs only · FIFO auto-matching"
      size="xl"
      footer={
        parsed ? (
          <>
            <button className="btn-secondary" onClick={reset}>Clear</button>
            <button className="btn-primary" onClick={handleImport}>Import {parsed.length} transactions</button>
          </>
        ) : (
          <button className="btn-secondary" onClick={() => { reset(); onClose(); }}>Close</button>
        )
      }
    >
      {!parsed ? (
        <div className="space-y-5">
          <div
            className="rounded-xl border-2 border-dashed border-slate-300 p-10 text-center transition-colors hover:border-primary-400 dark:border-slate-700 dark:hover:border-primary-500"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
          >
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            <FileSpreadsheet className="mx-auto text-slate-400" size={40} />
            <p className="mt-3 text-sm font-medium text-slate-700 dark:text-slate-300">Drop your XTB statement here</p>
            <p className="mt-1 text-xs text-slate-500">CSV or XLSX · CFDs and Forex are filtered out automatically</p>
            <button className="btn-secondary mt-4" onClick={() => fileRef.current?.click()}>
              <Upload size={15} /> Choose file
            </button>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3 dark:bg-slate-800/60">
            <p className="text-sm text-slate-600 dark:text-slate-300">Don't have a statement handy?</p>
            <button className="btn-ghost text-primary-600 dark:text-primary-400" onClick={downloadSample}>
              <Download size={15} /> Download sample CSV
            </button>
          </div>
          <div className="rounded-lg border border-slate-200 p-4 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-300">
            <p className="font-medium text-slate-800 dark:text-slate-200">How it works</p>
            <ul className="mt-2 space-y-1 text-xs">
              <li>1. Upload an XTB CSV/XLSX export of your trading history.</li>
              <li>2. We parse BUY/SELL/DIVIDEND/CASH rows, skipping CFDs and Forex.</li>
              <li>3. A FIFO engine matches sells to the earliest open buys.</li>
              <li>4. After import, you can re-assign matches manually in the Lot Matching view.</li>
            </ul>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 rounded-lg bg-primary-50 px-4 py-3 dark:bg-primary-500/10">
            <Check size={16} className="text-primary-600 dark:text-primary-400" />
            <span className="text-sm font-medium text-primary-800 dark:text-primary-300">
              Parsed {fileName}: {parsed.length} trades, {skipped.length} skipped, {matches.length} FIFO matches
            </span>
            <button className="btn-ghost ml-auto text-xs" onClick={() => setShowMatches((v) => !v)}>
              <GitCompare size={14} /> {showMatches ? "Hide" : "Show"} matches
            </button>
          </div>

          {skipped.length > 0 && (
            <details className="rounded-lg border border-warning-200 bg-warning-50 p-3 dark:border-warning-500/20 dark:bg-warning-500/10">
              <summary className="cursor-pointer text-sm font-medium text-warning-800 dark:text-warning-400">
                Skipped {skipped.length} rows (non-stock / unrecognized)
              </summary>
              <div className="mt-2 max-h-40 overflow-y-auto text-xs text-slate-600 dark:text-slate-400">
                {skipped.map((s, i) => (
                  <div key={i} className="py-1">{s.reason}: {Object.values(s.raw).slice(0, 4).join(" | ")}</div>
                ))}
              </div>
            </details>
          )}

          {showMatches && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-800">
              <div className="border-b border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 dark:border-slate-800 dark:text-slate-300">
                FIFO Matches ({matches.length})
              </div>
              <div className="max-h-60 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-800 dark:text-slate-400">
                      <th className="px-3 py-2">Ticker</th>
                      <th className="px-3 py-2">Buy Date</th>
                      <th className="px-3 py-2">Sell Date</th>
                      <th className="px-3 py-2 text-right">Qty</th>
                      <th className="px-3 py-2 text-right">Realized P&L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matches.map((m, i) => (
                      <tr key={i} className="border-b border-slate-100 dark:border-slate-800/60">
                        <td className="px-3 py-2 font-medium">{m.buyRow.ticker}</td>
                        <td className="px-3 py-2">{formatDate(m.buyRow.date, "short")}</td>
                        <td className="px-3 py-2">{formatDate(m.sellRow.date, "short")}</td>
                        <td className="px-3 py-2 text-right">{m.quantity}</td>
                        <td className={`px-3 py-2 text-right font-medium ${classForChange(m.realizedPnl)}`}>{formatCurrency(m.realizedPnl, m.buyRow.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="rounded-lg border border-slate-200 dark:border-slate-800">
            <div className="border-b border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 dark:border-slate-800 dark:text-slate-300">
              Parsed Trades ({parsed.length})
            </div>
            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Ticker</th>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">Price</th>
                    <th className="px-3 py-2 text-right">Fee</th>
                    <th className="px-3 py-2">Ccy</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.map((r, i) => (
                    <tr key={i} className="border-b border-slate-100 dark:border-slate-800/60">
                      <td className="px-3 py-2">
                        <span className={`badge ${r.type === "BUY" ? "bg-success-100 text-success-700 dark:bg-success-500/15 dark:text-success-400" : r.type === "SELL" ? "bg-error-100 text-error-700 dark:bg-error-500/15 dark:text-error-400" : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"}`}>{r.type}</span>
                      </td>
                      <td className="px-3 py-2 font-medium">{r.ticker}</td>
                      <td className="px-3 py-2">{formatDate(r.date, "short")}</td>
                      <td className="px-3 py-2 text-right">{r.quantity || "—"}</td>
                      <td className="px-3 py-2 text-right">{r.price || "—"}</td>
                      <td className="px-3 py-2 text-right">{r.fee || "—"}</td>
                      <td className="px-3 py-2 text-slate-400">{r.currency}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
