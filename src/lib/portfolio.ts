import type { Asset, Transaction, LotMatch, PortfolioSnapshot } from "./types";

export interface Lot {
  buyTransaction: Transaction;
  remainingQuantity: number;
  matched: { sellTransaction: Transaction; quantity: number }[];
}

/**
 * Compute open lots per asset from transactions + existing lot_matches.
 * Buys open lots; sells close them (per existing matches or FIFO for unmatched sells).
 */
export function computeLots(
  transactions: Transaction[],
  lotMatches: LotMatch[],
  assetId: string | null,
): Lot[] {
  if (!assetId) return [];
  const buys = transactions
    .filter((t) => t.asset_id === assetId && t.type === "BUY")
    .sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at));
  const sells = transactions
    .filter((t) => t.asset_id === assetId && t.type === "SELL")
    .sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at));

  // Build match map: sellId -> [{ buyId, quantity }]
  const matchesBySell = new Map<string, { buyId: string; quantity: number }[]>();
  for (const m of lotMatches) {
    const arr = matchesBySell.get(m.sell_transaction_id) || [];
    arr.push({ buyId: m.buy_transaction_id, quantity: Number(m.quantity) });
    matchesBySell.set(m.sell_transaction_id, arr);
  }

  const lots: Lot[] = buys.map((b) => ({
    buyTransaction: b,
    remainingQuantity: Number(b.quantity),
    matched: [],
  }));
  const lotByBuyId = new Map(lots.map((l) => [l.buyTransaction.id, l]));

  // First apply explicit matches
  for (const sell of sells) {
    const explicit = matchesBySell.get(sell.id) || [];
    for (const m of explicit) {
      const lot = lotByBuyId.get(m.buyId);
      if (!lot) continue;
      const qty = Math.min(m.quantity, lot.remainingQuantity, Number(sell.quantity));
      if (qty <= 0) continue;
      lot.remainingQuantity -= qty;
      lot.matched.push({ sellTransaction: sell, quantity: qty });
    }
  }

  // For sells without complete explicit matching, apply FIFO to remaining quantity
  for (const sell of sells) {
    const explicit = matchesBySell.get(sell.id) || [];
    const explicitQty = explicit.reduce((s, m) => s + m.quantity, 0);
    let remaining = Number(sell.quantity) - explicitQty;
    if (remaining <= 0) continue;
    for (const lot of lots) {
      if (remaining <= 0) break;
      if (lot.remainingQuantity <= 0) continue;
      // skip if this buy is after the sell (can't close a lot that didn't exist yet)
      if (lot.buyTransaction.date > sell.date) continue;
      const qty = Math.min(remaining, lot.remainingQuantity);
      lot.remainingQuantity -= qty;
      lot.matched.push({ sellTransaction: sell, quantity: qty });
      remaining -= qty;
    }
  }

  return lots;
}

export function realizedPnlForAsset(transactions: Transaction[], lotMatches: LotMatch[], assetId: string): number {
  const lots = computeLots(transactions, lotMatches, assetId);
  let pnl = 0;
  for (const lot of lots) {
    const buyCost = Number(lot.buyTransaction.price) + Number(lot.buyTransaction.fee) / Number(lot.buyTransaction.quantity);
    for (const m of lot.matched) {
      const sellPrice = Number(m.sellTransaction.price) - Number(m.sellTransaction.fee) / Number(m.sellTransaction.quantity);
      pnl += (sellPrice - buyCost) * m.quantity;
    }
  }
  return pnl;
}

export interface HoldingRaw {
  asset: Asset;
  transactions: Transaction[];
  quantity: number;
}

export function aggregateHoldings(transactions: Transaction[]): Map<string, HoldingRaw> {
  const map = new Map<string, HoldingRaw>();
  const assetMap = new Map<string, Asset>();
  for (const t of transactions) {
    if (!t.asset_id || !t.asset) continue;
    if (!assetMap.has(t.asset_id)) assetMap.set(t.asset_id, t.asset);
    let h = map.get(t.asset_id);
    if (!h) {
      h = { asset: t.asset, transactions: [], quantity: 0 };
      map.set(t.asset_id, h);
    }
    h.transactions.push(t);
    if (t.type === "BUY") h.quantity += Number(t.quantity);
    else if (t.type === "SELL") h.quantity -= Number(t.quantity);
  }
  return map;
}

/**
 * Compute Time-Weighted Rate of Return using daily snapshots.
 * TWR = product of (1 + daily_return) - 1, where daily_return = (end_value - cash_flow) / start_value.
 * Cash flows (CASH_IN/CASH_OUT, BUY/SELL) are accounted at the beginning of the day they occur.
 *
 * @param transactions sorted transactions
 * @param priceHistory per asset: assetId -> { date -> price_in_base_currency }
 * @param baseCurrency portfolio base currency
 * @param startDate first day
 * @param endDate last day
 * @returns daily snapshots with totalValue (market), invested, and cumulative twr
 */
export function computePortfolioSnapshots(
  transactions: Transaction[],
  priceHistory: Map<string, Map<string, number>>,
  baseCurrency: string,
  startDate: string,
  endDate: string,
): PortfolioSnapshot[] {
  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at));
  const dates: string[] = [];
  const d0 = new Date(startDate);
  const d1 = new Date(endDate);
  for (let d = new Date(d0); d <= d1; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10));
  }
  if (dates.length === 0) return [];

  const snapshots: PortfolioSnapshot[] = [];
  let prevValue = 0;
  let twr = 0;
  let invested = 0;

  // helper: holdings as of a date (open quantity per asset)
  const holdings = new Map<string, number>(); // assetId -> qty
  const cash = 0; // not tracked separately; TWR focuses on market value + flows

  for (const date of dates) {
    // apply transactions that occurred before or on this date and haven't been applied yet
    for (const t of sorted) {
      if (t.date > date) break;
      if (t._applied) continue;
      t._applied = true;
      if (t.type === "BUY") {
        const q = (holdings.get(t.asset_id!) || 0) + Number(t.quantity);
        holdings.set(t.asset_id!, q);
        invested += Number(t.quantity) * Number(t.price) * fxFor(t.currency, baseCurrency);
      } else if (t.type === "SELL") {
        const q = (holdings.get(t.asset_id!) || 0) - Number(t.quantity);
        holdings.set(t.asset_id!, q);
        invested -= Number(t.quantity) * Number(t.price) * fxFor(t.currency, baseCurrency);
      }
    }

    // market value as of this date
    let marketValue = 0;
    for (const [assetId, qty] of holdings) {
      if (qty <= 0) continue;
      const ph = priceHistory.get(assetId);
      const price = ph ? (ph.get(date) ?? lastKnown(ph, date)) : 0;
      marketValue += price * qty;
    }

    // cash flows occurring on this date (deposits/withdrawals) — affects TWR
    const todayFlows = sorted.filter((t) => t.date === date && (t.type === "CASH_IN" || t.type === "CASH_OUT"));
    let flow = 0;
    for (const f of todayFlows) {
      flow += (f.type === "CASH_IN" ? 1 : -1) * Number(f.price) * fxFor(f.currency, baseCurrency);
    }

    if (prevValue > 0) {
      // daily return: (end - flow) / start
      const dailyReturn = (marketValue - flow - prevValue) / prevValue;
      twr = (1 + twr) * (1 + dailyReturn) - 1;
    }
    prevValue = marketValue;

    snapshots.push({ date, totalValue: marketValue, invested, twr: twr * 100 });
  }

  return snapshots;
}

// Augment Transaction with transient _applied flag
declare module "./types" {
  interface Transaction {
    _applied?: boolean;
  }
}

function fxFor(source: string, base: string): number {
  if (source === base) return 1;
  // approximate static factors used for TWR demo; real conversion uses fx_cache
  if (source === "USD" && base === "PLN") return 4.0;
  if (source === "EUR" && base === "PLN") return 4.3;
  if (source === "PLN" && base === "USD") return 0.25;
  if (source === "PLN" && base === "EUR") return 0.23;
  if (source === "USD" && base === "EUR") return 0.92;
  if (source === "EUR" && base === "USD") return 1.08;
  return 1;
}

function lastKnown(ph: Map<string, number>, date: string): number {
  let latest = 0;
  for (const [d, p] of ph) {
    if (d <= date && p > 0) latest = p;
  }
  return latest;
}

export function timeRangeToDates(range: "1M" | "6M" | "YTD" | "1Y" | "ALL"): { start: string; end: string } {
  const end = new Date();
  const start = new Date(end);
  switch (range) {
    case "1M":
      start.setMonth(start.getMonth() - 1);
      break;
    case "6M":
      start.setMonth(start.getMonth() - 6);
      break;
    case "YTD":
      start.setMonth(0);
      start.setDate(1);
      break;
    case "1Y":
      start.setFullYear(start.getFullYear() - 1);
      break;
    case "ALL":
      start.setFullYear(start.getFullYear() - 5);
      break;
  }
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export function clearAppliedFlags(transactions: Transaction[]): void {
  for (const t of transactions) delete t._applied;
}
