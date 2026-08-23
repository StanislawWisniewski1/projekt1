import { useState, useMemo, useRef } from "react";
import { useData } from "@/context/DataContext";
import { usePortfolioSummary } from "@/hooks/usePortfolioSummary";
import { useToast } from "@/components/ui/ToastContext";
import { StatCard } from "@/components/ui/StatCard";
import { PerformanceChart } from "@/components/PerformanceChart";
import { HoldingsTable } from "@/components/HoldingsTable";
import { TransactionsList } from "@/components/TransactionsList";
import { TransactionFormModal } from "@/components/TransactionFormModal";
import { XtbImportModal } from "@/components/XtbImportModal";
import { LotMatchingModal } from "@/components/LotMatchingModal";
import { AssetDetailModal } from "@/components/AssetDetailModal";
import { PortfolioCreateModal } from "@/components/PortfolioCreateModal";
import { formatCurrency, formatPct, classForChange } from "@/lib/format";
import type { Holding, TransactionType } from "@/lib/types";
import {
  Plus, Wallet, TrendingUp, Sparkles, Upload, GitCompare, PiggyBank, BarChart3, ChevronDown, Check,
  Download, FileUp, Trash2, ArrowUpRight, ArrowDownRight, Banknote,
} from "lucide-react";

export function Dashboard() {
  const {
    portfolios, assets, transactions, lotMatches,
    addPortfolio, deletePortfolio, addAsset, addTransaction, deleteTransaction,
    addLotMatches, deleteLotMatch, deleteLotMatchesForSell, addLotMatch,
    exportData, importData, clearAllData, loadSampleData,
  } = useData();
  const { pushToast } = useToast();
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string | null>(null);
  const [portfolioMenuOpen, setPortfolioMenuOpen] = useState(false);
  const [txModalOpen, setTxModalOpen] = useState(false);
  const [txDefaultType, setTxDefaultType] = useState<TransactionType>("BUY");
  const [xtbOpen, setXtbOpen] = useState(false);
  const [lotMatchingOpen, setLotMatchingOpen] = useState(false);
  const [createPortfolioOpen, setCreatePortfolioOpen] = useState(false);
  const [selectedHolding, setSelectedHolding] = useState<Holding | null>(null);
  const [tab, setTab] = useState<"holdings" | "transactions">("holdings");
  const importRef = useRef<HTMLInputElement>(null);

  const portfolio = useMemo(() => {
    if (portfolios.length === 0) return null;
    return portfolios.find((p) => p.id === selectedPortfolioId) || portfolios[0];
  }, [portfolios, selectedPortfolioId]);

  const summary = usePortfolioSummary(transactions, lotMatches, portfolio?.base_currency || "PLN", portfolio?.id || "");

  const handleExport = () => {
    exportData();
    pushToast("success", "Data exported as JSON backup.");
  };

  const handleImportFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const ok = importData(String(reader.result));
      pushToast(ok ? "success" : "error", ok ? "Data imported successfully." : "Invalid backup file.");
    };
    reader.readAsText(file);
  };

  const handleClear = () => {
    if (confirm("This will permanently delete all your portfolios, transactions, and lot matches. Continue?")) {
      clearAllData();
      pushToast("success", "All data cleared.");
    }
  };

  const handleLoadSample = () => {
    if (confirm("This will replace your current data with sample demo data. Continue?")) {
      loadSampleData();
      pushToast("success", "Sample data loaded.");
    }
  };

  const handleDeletePortfolio = (id: string) => {
    if (confirm("Delete this portfolio and all its transactions?")) {
      deletePortfolio(id);
      pushToast("success", "Portfolio deleted.");
    }
  };

  if (portfolios.length === 0) {
    return (
      <div className="mx-auto mt-16 max-w-md text-center">
        <div className="mx-auto mb-4 w-fit rounded-2xl bg-primary-600 p-3 text-white">
          <PiggyBank size={28} />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Welcome to Folio</h2>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Create your first portfolio to start tracking investments, performance, and returns. All data stays in your browser.</p>
        <button className="btn-primary mt-6" onClick={() => setCreatePortfolioOpen(true)}>
          <Plus size={16} /> Create first portfolio
        </button>
        <button className="btn-secondary mt-3 ml-2" onClick={handleLoadSample}>
          <Sparkles size={15} /> Load sample data
        </button>
        <PortfolioCreateModal open={createPortfolioOpen} onClose={() => setCreatePortfolioOpen(false)} onCreated={(p) => setSelectedPortfolioId(p.id)} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Portfolio selector + actions */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative">
          <button
            onClick={() => setPortfolioMenuOpen((v) => !v)}
            className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-left shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
          >
            <div className="rounded-lg bg-primary-50 p-2 text-primary-600 dark:bg-primary-500/10 dark:text-primary-400">
              <Wallet size={18} />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{portfolio!.name}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Base: {portfolio!.base_currency}</div>
            </div>
            <ChevronDown size={16} className="text-slate-400" />
          </button>
          {portfolioMenuOpen && (
            <div className="absolute z-20 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg dark:border-slate-800 dark:bg-slate-900">
              {portfolios.map((p) => (
                <div
                  key={p.id}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 ${p.id === portfolio!.id ? "text-primary-700 dark:text-primary-400" : "text-slate-700 dark:text-slate-300"}`}
                >
                  <button onClick={() => { setSelectedPortfolioId(p.id); setPortfolioMenuOpen(false); }} className="flex-1 text-left">
                    <span className="font-medium">{p.name}</span>
                    <span className="ml-2 text-xs text-slate-400">{p.base_currency}</span>
                  </button>
                  {p.id === portfolio!.id && <Check size={15} className="mr-1" />}
                  {portfolios.length > 1 && (
                    <button onClick={() => { handleDeletePortfolio(p.id); setPortfolioMenuOpen(false); }} className="text-slate-400 hover:text-error-600" aria-label="Delete portfolio">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
              <div className="my-1 border-t border-slate-200 dark:border-slate-800" />
              <button onClick={() => { setPortfolioMenuOpen(false); setCreatePortfolioOpen(true); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800">
                <Plus size={15} /> New portfolio
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-secondary" onClick={() => setXtbOpen(true)}>
            <Upload size={15} /> Import XTB
          </button>
          <button className="btn-secondary" onClick={() => setLotMatchingOpen(true)}>
            <GitCompare size={15} /> Lot Matching
          </button>
          <div className="inline-flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-800">
            <button onClick={() => { setTxDefaultType("BUY"); setTxModalOpen(true); }} className="btn-ghost rounded-md px-3 py-1.5 text-sm">
              <Plus size={15} /> Buy
            </button>
            <button onClick={() => { setTxDefaultType("SELL"); setTxModalOpen(true); }} className="btn-ghost rounded-md px-3 py-1.5 text-sm">
              Sell
            </button>
            <button onClick={() => { setTxDefaultType("DIVIDEND"); setTxModalOpen(true); }} className="btn-ghost rounded-md px-3 py-1.5 text-sm">
              Div
            </button>
            <button onClick={() => { setTxDefaultType("CASH_IN"); setTxModalOpen(true); }} className="btn-ghost rounded-md px-3 py-1.5 text-sm">
              Cash
            </button>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Value"
          value={formatCurrency(summary.totalValue, portfolio!.base_currency)}
          change={summary.dayChangePct}
          changeLabel="today"
          icon={<BarChart3 size={20} />}
        />
        <StatCard
          label="Unrealized P&L"
          value={formatCurrency(summary.totalPnl, portfolio!.base_currency)}
          change={summary.totalPnlPct}
          changeLabel="all time"
          icon={<TrendingUp size={20} />}
          accent={summary.totalPnl >= 0 ? "success" : "error"}
        />
        <StatCard
          label="Un-invested Cash"
          value={formatCurrency(summary.uninvestedCash, portfolio!.base_currency)}
          icon={<Banknote size={20} />}
          accent="default"
        />
        <StatCard
          label="Realized P&L"
          value={formatCurrency(summary.realizedPnl, portfolio!.base_currency)}
          icon={<PiggyBank size={20} />}
          accent={summary.realizedPnl >= 0 ? "success" : "error"}
        />
      </div>

      {/* Top movers */}
      {(summary.topGainers.length > 0 || summary.topLosers.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-2">
          <MoversCard title="Top Gainers" icon={<ArrowUpRight size={16} className="text-success-600 dark:text-success-400" />} movers={summary.topGainers} baseCurrency={portfolio!.base_currency} />
          <MoversCard title="Top Losers" icon={<ArrowDownRight size={16} className="text-error-600 dark:text-error-400" />} movers={summary.topLosers} baseCurrency={portfolio!.base_currency} />
        </div>
      )}

      {/* Chart */}
      <PerformanceChart
        transactions={transactions}
        assets={assets}
        baseCurrency={portfolio!.base_currency}
        portfolioId={portfolio!.id}
      />

      {/* Tab switcher */}
      <div className="flex items-center gap-2">
        <div className="inline-flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-800">
          <button
            onClick={() => setTab("holdings")}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${tab === "holdings" ? "bg-primary-600 text-white" : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"}`}
          >
            Holdings
          </button>
          <button
            onClick={() => setTab("transactions")}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${tab === "transactions" ? "bg-primary-600 text-white" : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"}`}
          >
            Transactions
          </button>
        </div>
      </div>

      {tab === "holdings" ? (
        <HoldingsTable holdings={summary.holdings} baseCurrency={portfolio!.base_currency} onSelect={setSelectedHolding} />
      ) : (
        <TransactionsList transactions={transactions} portfolioId={portfolio!.id} onDeleted={(id) => deleteTransaction(id)} />
      )}

      {/* Data management footer */}
      <div className="card flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Data Management</h4>
          <p className="text-xs text-slate-400">Your data is stored locally in this browser. Export regularly to back up.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-secondary text-xs" onClick={handleExport}>
            <Download size={14} /> Export
          </button>
          <input ref={importRef} type="file" accept=".json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportFile(f); }} />
          <button className="btn-secondary text-xs" onClick={() => importRef.current?.click()}>
            <FileUp size={14} /> Import
          </button>
          <button className="btn-secondary text-xs" onClick={handleLoadSample}>
            <Sparkles size={14} /> Sample Data
          </button>
          <button className="btn-danger text-xs" onClick={handleClear}>
            <Trash2 size={14} /> Clear All
          </button>
        </div>
      </div>

      {/* Modals */}
      <TransactionFormModal
        open={txModalOpen}
        onClose={() => setTxModalOpen(false)}
        portfolio={portfolio!}
        assets={assets}
        defaultType={txDefaultType}
        onSave={(tx) => { addTransaction(tx); pushToast("success", "Transaction recorded."); }}
        onCreateAsset={addAsset}
      />
      <XtbImportModal
        open={xtbOpen}
        onClose={() => setXtbOpen(false)}
        portfolio={portfolio!}
        assets={assets}
        onImport={(newAssets, txs, matches) => {
          const assetMap = new Map(assets.map((a) => [`${a.ticker}|${a.exchange}`, a.id]));
          for (const na of newAssets) {
            const a = addAsset(na.ticker, na.exchange, na.currency, na.name, na.type);
            assetMap.set(`${a.ticker}|${a.exchange}`, a.id);
          }
          for (const tx of txs) addTransaction(tx);
          addLotMatches(matches);
          pushToast("success", `Imported ${txs.length} transactions with ${matches.length} FIFO matches.`);
        }}
      />
      <LotMatchingModal
        open={lotMatchingOpen}
        onClose={() => setLotMatchingOpen(false)}
        transactions={transactions}
        lotMatches={lotMatches}
        portfolioId={portfolio!.id}
        onUnmatch={(id) => { deleteLotMatch(id); pushToast("success", "Match removed."); }}
        onReassign={(sellId, buyId, qty, pnl) => {
          deleteLotMatchesForSell(sellId);
          addLotMatch({ sell_transaction_id: sellId, buy_transaction_id: buyId, quantity: qty, realized_pnl: pnl, method: "MANUAL" });
          pushToast("success", "Lot re-assigned.");
        }}
      />
      <AssetDetailModal
        open={!!selectedHolding}
        onClose={() => setSelectedHolding(null)}
        holding={selectedHolding}
        transactions={transactions}
        lotMatches={lotMatches}
        baseCurrency={portfolio!.base_currency}
      />
      <PortfolioCreateModal open={createPortfolioOpen} onClose={() => setCreatePortfolioOpen(false)} onCreate={addPortfolio} onCreated={(p) => setSelectedPortfolioId(p.id)} />
    </div>
  );
}

function MoversCard({ title, icon, movers, baseCurrency }: { title: string; icon: React.ReactNode; movers: Holding[]; baseCurrency: string }) {
  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">{title}</h4>
      </div>
      {movers.length === 0 ? (
        <p className="text-xs text-slate-400">No movers today.</p>
      ) : (
        <div className="space-y-2">
          {movers.map((h) => (
            <div key={h.asset.id} className="flex items-center justify-between text-sm">
              <div>
                <span className="font-medium text-slate-900 dark:text-slate-100">{h.asset.ticker}</span>
                <span className="ml-2 text-xs text-slate-400">{h.asset.exchange}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500 dark:text-slate-400">{formatCurrency(h.marketValue, baseCurrency)}</span>
                <span className={`font-medium tabular-nums ${classForChange(h.dayChangePct)}`}>{formatPct(h.dayChangePct)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
