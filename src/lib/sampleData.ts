import type { AppData, Portfolio, Asset, Transaction, LotMatch, TransactionType } from "./types";

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function generateSampleData(): AppData {
  const portfolio: Portfolio = {
    id: uid(),
    name: "Main Portfolio",
    base_currency: "PLN",
    created_at: new Date().toISOString(),
  };

  const assets: Asset[] = [
    { id: uid(), ticker: "AAPL", exchange: "NASDAQ", currency: "USD", name: "Apple Inc.", type: "stock", created_at: new Date().toISOString() },
    { id: uid(), ticker: "MSFT", exchange: "NASDAQ", currency: "USD", name: "Microsoft Corp.", type: "stock", created_at: new Date().toISOString() },
    { id: uid(), ticker: "NVDA", exchange: "NASDAQ", currency: "USD", name: "NVIDIA Corp.", type: "stock", created_at: new Date().toISOString() },
    { id: uid(), ticker: "CDR", exchange: "GPW", currency: "PLN", name: "CD Projekt SA", type: "stock", created_at: new Date().toISOString() },
    { id: uid(), ticker: "PKN", exchange: "GPW", currency: "PLN", name: "PKN Orlen SA", type: "stock", created_at: new Date().toISOString() },
    { id: uid(), ticker: "VOO", exchange: "NYSE", currency: "USD", name: "Vanguard S&P 500 ETF", type: "etf", created_at: new Date().toISOString() },
  ];
  const byTicker = new Map(assets.map((a) => [a.ticker, a.id]));

  const txDefs: { type: TransactionType; ticker?: string; date: string; quantity: number; price: number; fee: number; currency: string; note?: string }[] = [
    { type: "CASH_IN", date: "2024-01-05", quantity: 0, price: 50000, fee: 0, currency: "PLN", note: "Initial deposit" },
    { type: "BUY", ticker: "AAPL", date: "2024-01-15", quantity: 20, price: 185.2, fee: 1.5, currency: "USD" },
    { type: "BUY", ticker: "MSFT", date: "2024-02-03", quantity: 10, price: 408.5, fee: 1.0, currency: "USD" },
    { type: "BUY", ticker: "CDR", date: "2024-02-10", quantity: 30, price: 118.4, fee: 5, currency: "PLN" },
    { type: "BUY", ticker: "VOO", date: "2024-03-01", quantity: 5, price: 470.1, fee: 1.5, currency: "USD" },
    { type: "DIVIDEND", ticker: "MSFT", date: "2024-03-15", quantity: 0, price: 7.3, fee: 0, currency: "USD" },
    { type: "SELL", ticker: "AAPL", date: "2024-04-20", quantity: 8, price: 165.3, fee: 1.5, currency: "USD" },
    { type: "BUY", ticker: "NVDA", date: "2024-05-12", quantity: 15, price: 96.4, fee: 1.0, currency: "USD" },
    { type: "BUY", ticker: "PKN", date: "2024-06-04", quantity: 40, price: 62.5, fee: 5, currency: "PLN" },
    { type: "SELL", ticker: "CDR", date: "2024-07-18", quantity: 10, price: 132.8, fee: 5, currency: "PLN" },
    { type: "DIVIDEND", ticker: "MSFT", date: "2024-09-15", quantity: 0, price: 8.0, fee: 0, currency: "USD" },
    { type: "BUY", ticker: "AAPL", date: "2024-10-02", quantity: 12, price: 225.4, fee: 1.5, currency: "USD" },
    { type: "CASH_IN", date: "2024-11-10", quantity: 0, price: 10000, fee: 0, currency: "PLN", note: "Top-up" },
    { type: "SELL", ticker: "NVDA", date: "2025-01-15", quantity: 7, price: 138.5, fee: 1.0, currency: "USD" },
    { type: "DIVIDEND", ticker: "VOO", date: "2025-03-20", quantity: 0, price: 5.2, fee: 0, currency: "USD" },
  ];

  const transactions: Transaction[] = txDefs.map((d, i) => ({
    id: uid(),
    portfolio_id: portfolio.id,
    asset_id: d.ticker ? byTicker.get(d.ticker) || null : null,
    type: d.type,
    date: d.date,
    quantity: d.quantity,
    price: d.price,
    fee: d.fee,
    currency: d.currency,
    note: d.note || null,
    created_at: new Date(Date.now() + i * 1000).toISOString(),
  }));

  // Build FIFO lot matches
  const buys = transactions.filter((t) => t.type === "BUY").sort((a, b) => a.date.localeCompare(b.date));
  const sells = transactions.filter((t) => t.type === "SELL").sort((a, b) => a.date.localeCompare(b.date));
  const openLots: { txId: string; assetId: string; remaining: number; price: number; fee: number; qty: number }[] = [];
  const lotMatches: LotMatch[] = [];

  for (const b of buys) {
    openLots.push({ txId: b.id, assetId: b.asset_id!, remaining: b.quantity, price: b.price, fee: b.fee, qty: b.quantity });
  }
  for (const s of sells) {
    let toClose = s.quantity;
    for (const lot of openLots) {
      if (toClose <= 0) break;
      if (lot.assetId !== s.asset_id) continue;
      if (lot.remaining <= 0) continue;
      const qty = Math.min(toClose, lot.remaining);
      const buyCost = lot.price + lot.fee / lot.qty;
      const sellPrice = s.price - s.fee / s.quantity;
      const pnl = (sellPrice - buyCost) * qty;
      lotMatches.push({
        id: uid(),
        sell_transaction_id: s.id,
        buy_transaction_id: lot.txId,
        quantity: qty,
        realized_pnl: pnl,
        method: "FIFO",
        created_at: new Date().toISOString(),
      });
      lot.remaining -= qty;
      toClose -= qty;
    }
  }

  return { portfolios: [portfolio], assets, transactions, lotMatches, version: 1 };
}
