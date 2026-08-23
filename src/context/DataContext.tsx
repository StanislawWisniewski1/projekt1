import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import type { AppData, Portfolio, Asset, Transaction, LotMatch, TransactionType } from "@/lib/types";
import { generateSampleData } from "@/lib/sampleData";

const STORAGE_KEY = "folio-data-v1";

const emptyData: AppData = {
  portfolios: [],
  assets: [],
  transactions: [],
  lotMatches: [],
  version: 1,
};

interface DataContextValue {
  data: AppData;
  portfolios: Portfolio[];
  assets: Asset[];
  transactions: Transaction[];
  lotMatches: LotMatch[];
  addPortfolio: (name: string, baseCurrency: string) => Portfolio;
  deletePortfolio: (id: string) => void;
  addAsset: (ticker: string, exchange: string, currency: string, name: string, type: string) => Asset;
  addTransaction: (tx: Omit<Transaction, "id" | "created_at" | "asset">) => void;
  deleteTransaction: (id: string) => void;
  addLotMatches: (matches: Omit<LotMatch, "id" | "created_at">[]) => void;
  deleteLotMatch: (id: string) => void;
  deleteLotMatchesForSell: (sellId: string) => void;
  addLotMatch: (match: Omit<LotMatch, "id" | "created_at">) => void;
  exportData: () => void;
  importData: (json: string) => boolean;
  clearAllData: () => void;
  loadSampleData: () => void;
}

const DataContext = createContext<DataContextValue | undefined>(undefined);

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(emptyData);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as AppData;
        setData(parsed);
      } else {
        const sample = generateSampleData();
        setData(sample);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(sample));
      }
    } catch {
      const sample = generateSampleData();
      setData(sample);
    }
  }, []);

  const persist = useCallback((newData: AppData) => {
    setData(newData);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newData));
    } catch { /* ignore quota errors */ }
  }, []);

  const addPortfolio = useCallback((name: string, baseCurrency: string): Portfolio => {
    const p: Portfolio = {
      id: uid(),
      name,
      base_currency: baseCurrency,
      created_at: new Date().toISOString(),
    };
    persist({ ...data, portfolios: [...data.portfolios, p] });
    return p;
  }, [data, persist]);

  const deletePortfolio = useCallback((id: string) => {
    const txIds = data.transactions.filter((t) => t.portfolio_id === id).map((t) => t.id);
    persist({
      ...data,
      portfolios: data.portfolios.filter((p) => p.id !== id),
      transactions: data.transactions.filter((t) => t.portfolio_id !== id),
      lotMatches: data.lotMatches.filter((m) => !txIds.includes(m.sell_transaction_id) && !txIds.includes(m.buy_transaction_id)),
    });
  }, [data, persist]);

  const addAsset = useCallback((ticker: string, exchange: string, currency: string, name: string, type: string): Asset => {
    const existing = data.assets.find((a) => a.ticker === ticker.toUpperCase() && a.exchange === exchange);
    if (existing) return existing;
    const a: Asset = {
      id: uid(),
      ticker: ticker.toUpperCase(),
      exchange,
      currency,
      name,
      type,
      created_at: new Date().toISOString(),
    };
    persist({ ...data, assets: [...data.assets, a] });
    return a;
  }, [data, persist]);

  const addTransaction = useCallback((tx: Omit<Transaction, "id" | "created_at" | "asset">) => {
    const t: Transaction = { ...tx, id: uid(), created_at: new Date().toISOString() };
    persist({ ...data, transactions: [...data.transactions, t] });
  }, [data, persist]);

  const deleteTransaction = useCallback((id: string) => {
    persist({
      ...data,
      transactions: data.transactions.filter((t) => t.id !== id),
      lotMatches: data.lotMatches.filter((m) => m.sell_transaction_id !== id && m.buy_transaction_id !== id),
    });
  }, [data, persist]);

  const addLotMatches = useCallback((matches: Omit<LotMatch, "id" | "created_at">[]) => {
    const newMatches: LotMatch[] = matches.map((m) => ({ ...m, id: uid(), created_at: new Date().toISOString() }));
    persist({ ...data, lotMatches: [...data.lotMatches, ...newMatches] });
  }, [data, persist]);

  const deleteLotMatch = useCallback((id: string) => {
    persist({ ...data, lotMatches: data.lotMatches.filter((m) => m.id !== id) });
  }, [data, persist]);

  const deleteLotMatchesForSell = useCallback((sellId: string) => {
    persist({ ...data, lotMatches: data.lotMatches.filter((m) => m.sell_transaction_id !== sellId) });
  }, [data, persist]);

  const addLotMatch = useCallback((match: Omit<LotMatch, "id" | "created_at">) => {
    const m: LotMatch = { ...match, id: uid(), created_at: new Date().toISOString() };
    persist({ ...data, lotMatches: [...data.lotMatches, m] });
  }, [data, persist]);

  const exportData = useCallback(() => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `folio-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [data]);

  const importData = useCallback((json: string): boolean => {
    try {
      const parsed = JSON.parse(json) as AppData;
      if (!parsed.portfolios || !parsed.assets || !parsed.transactions) return false;
      persist(parsed);
      return true;
    } catch {
      return false;
    }
  }, [persist]);

  const clearAllData = useCallback(() => {
    persist(emptyData);
  }, [persist]);

  const loadSampleData = useCallback(() => {
    const sample = generateSampleData();
    persist(sample);
  }, [persist]);

  // Enrich transactions with their asset reference for convenience
  const transactionsWithAssets: Transaction[] = data.transactions.map((t) => ({
    ...t,
    asset: t.asset_id ? data.assets.find((a) => a.id === t.asset_id) || null : null,
  }));

  return (
    <DataContext.Provider value={{
      data,
      portfolios: data.portfolios,
      assets: data.assets,
      transactions: transactionsWithAssets,
      lotMatches: data.lotMatches,
      addPortfolio,
      deletePortfolio,
      addAsset,
      addTransaction,
      deleteTransaction,
      addLotMatches,
      deleteLotMatch,
      deleteLotMatchesForSell,
      addLotMatch,
      exportData,
      importData,
      clearAllData,
      loadSampleData,
    }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within DataProvider");
  return ctx;
}
