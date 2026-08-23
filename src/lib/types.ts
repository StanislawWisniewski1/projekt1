export type TransactionType = "BUY" | "SELL" | "DIVIDEND" | "CASH_IN" | "CASH_OUT";

export interface Portfolio {
  id: string;
  name: string;
  base_currency: string;
  created_at: string;
}

export interface Asset {
  id: string;
  ticker: string;
  exchange: string;
  name: string | null;
  currency: string;
  type: string;
  created_at: string;
}

export interface Transaction {
  id: string;
  portfolio_id: string;
  asset_id: string | null;
  type: TransactionType;
  date: string;
  quantity: number;
  price: number;
  fee: number;
  currency: string;
  note: string | null;
  created_at: string;
  asset?: Asset | null;
}

export interface LotMatch {
  id: string;
  sell_transaction_id: string;
  buy_transaction_id: string;
  quantity: number;
  realized_pnl: number;
  method: "FIFO" | "MANUAL";
  created_at: string;
}

export interface PricePoint {
  date: string;
  price: number;
  price_base: number;
}

export interface FxRate {
  date: string;
  rate: number;
}

export interface Holding {
  asset: Asset;
  quantity: number;
  avgCost: number;
  costBasis: number;
  marketPrice: number;
  marketValue: number;
  marketValueBase: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  dayChange: number;
  dayChangePct: number;
  currency: string;
  allocationPct: number;
}

export interface PortfolioSnapshot {
  date: string;
  totalValue: number;
  invested: number;
  twr: number;
}

export interface Quote {
  ticker: string;
  exchange: string;
  price: number;
  change: number;
  changePct: number;
  currency: string;
}

export interface AppData {
  portfolios: Portfolio[];
  assets: Asset[];
  transactions: Transaction[];
  lotMatches: LotMatch[];
  version: number;
}
