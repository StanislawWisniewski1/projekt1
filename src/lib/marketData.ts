import type { Asset, Quote, PricePoint } from "./types";

// Fetch a delayed quote from Stooq directly from the browser.
export async function fetchQuote(ticker: string, exchange: string): Promise<Quote | null> {
  try {
    const sym = stooqSymbol(ticker, exchange);
    const url = `https://stooq.com/q/l/?s=${sym.toLowerCase()}&f=sd2t2ohlcv&e=csv`;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const text = await resp.text().trim();
    const lines = text.split(/\r?\n/);
    if (lines.length < 2) return null;
    const cols = lines[1].split(",");
    if (cols.length < 7) return null;
    const close = parseFloat(cols[6]);
    if (isNaN(close) || close <= 0) return null;
    const ex = (exchange || "").toUpperCase();
    const currency = ex === "GPW" || ex === "WARSAW" || ex === "WSE" ? "PLN" : "USD";
    let change = 0, changePct = 0;
    try {
      const today = new Date();
      const start = new Date(today);
      start.setDate(start.getDate() - 14);
      const fmt = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");
      const hist = await fetchHistory(ticker, exchange, fmt(start), fmt(today));
      if (hist.length >= 2) {
        const last = hist[hist.length - 1].price;
        const prev = hist[hist.length - 2].price;
        change = last - prev;
        changePct = prev > 0 ? ((last - prev) / prev) * 100 : 0;
      }
    } catch { /* ignore */ }
    return { ticker, exchange, price: close, change, changePct, currency };
  } catch {
    return null;
  }
}

export async function fetchHistory(
  ticker: string,
  exchange: string,
  start: string,
  end: string,
): Promise<{ date: string; price: number }[]> {
  try {
    const sym = stooqSymbol(ticker, exchange);
    const url = `https://stooq.com/q/d/l/?s=${sym.toLowerCase()}&d1=${start}&d2=${end}&i=d`;
    const resp = await fetch(url);
    if (!resp.ok) return [];
    const text = await resp.text();
    return parseStooqCsv(text);
  } catch {
    return [];
  }
}

export async function fetchBulkHistory(
  assets: { asset_id: string; ticker: string; exchange: string; currency: string }[],
  start: string,
  end: string,
  base_currency: string,
): Promise<Record<string, PricePoint[]>> {
  const results: Record<string, PricePoint[]> = {};
  for (const a of assets) {
    try {
      const prices = await fetchHistory(a.ticker, a.exchange, start, end);
      let fxRates: { date: string; rate: number }[] = [];
      if (a.currency && a.currency !== base_currency) {
        fxRates = await fetchFxHistory(a.currency, base_currency, start, end);
      }
      const rateMap = new Map(fxRates.map((r) => [r.date, r.rate]));
      results[a.asset_id] = prices.map((p) => {
        const fx = a.currency === base_currency ? 1 : (rateMap.get(p.date) ?? [...rateMap.values()][0] ?? 1);
        return { date: p.date, price: p.price, price_base: p.price * fx };
      });
    } catch {
      results[a.asset_id] = [];
    }
  }
  return results;
}

export async function fetchFxHistory(
  source: string,
  base: string,
  start: string,
  end: string,
): Promise<{ date: string; rate: number }[]> {
  if (source === base) return [{ date: start, rate: 1 }];
  if (base === "PLN") return fetchNbpRates(source, start, end);
  return [{ date: start, rate: fxApprox(source, base) }];
}

export async function fetchFxLatest(source: string, base: string): Promise<number> {
  if (source === base) return 1;
  if (base === "PLN") {
    const today = new Date();
    const start = new Date(today);
    start.setDate(start.getDate() - 14);
    const fmt = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");
    const rates = await fetchNbpRates(source, fmt(start), fmt(today));
    return rates.length > 0 ? rates[rates.length - 1].rate : fxApprox(source, base);
  }
  return fxApprox(source, base);
}

function stooqSymbol(ticker: string, exchange: string): string {
  const t = ticker.toUpperCase().replace(/\./g, "");
  const ex = (exchange || "").toUpperCase();
  if (ex === "GPW" || ex === "WARSAW" || ex === "WSE") return `${t}.PL`;
  if (ex === "NYSE" || ex === "NASDAQ" || ex === "US" || ex === "UNKNOWN") return t;
  if (ex === "LSE" || ex === "UK") return `${t}.L`;
  if (ex === "XETRA" || ex === "GERMANY") return `${t}.DE`;
  if (ex === "EPA" || ex === "FRANCE") return `${t}.FR`;
  return t;
}

function parseStooqCsv(csv: string): { date: string; price: number }[] {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = lines[0].split(",");
  const dateIdx = header.indexOf("Date");
  const closeIdx = header.indexOf("Close");
  if (dateIdx === -1 || closeIdx === -1) return [];
  const rows: { date: string; price: number }[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    if (cols.length < Math.max(dateIdx, closeIdx) + 1) continue;
    const price = parseFloat(cols[closeIdx]);
    if (!isNaN(price) && price > 0) rows.push({ date: cols[dateIdx], price });
  }
  return rows;
}

async function fetchNbpRates(source: string, start: string, end: string): Promise<{ date: string; rate: number }[]> {
  const cur = source.toUpperCase();
  const s = start.replace(/-/g, "");
  const e = end.replace(/-/g, "");
  const url = `https://api.nbp.pl/api/exchangerates/rates/a/${cur.toLowerCase()}/${s}/${e}/?format=json`;
  try {
    const resp = await fetch(url, { headers: { Accept: "application/json" } });
    if (!resp.ok) return [];
    const data = await resp.json();
    return (data.rates || []).map((r: { effectiveDate: string; mid: number }) => ({ date: r.effectiveDate, rate: r.mid }));
  } catch {
    return [];
  }
}

export function fxApprox(source: string, base: string): number {
  if (source === base) return 1;
  if (source === "USD" && base === "PLN") return 4.0;
  if (source === "EUR" && base === "PLN") return 4.3;
  if (source === "PLN" && base === "USD") return 0.25;
  if (source === "PLN" && base === "EUR") return 0.23;
  if (source === "USD" && base === "EUR") return 0.92;
  if (source === "EUR" && base === "USD") return 1.08;
  if (source === "GBP" && base === "PLN") return 5.1;
  if (source === "GBP" && base === "USD") return 1.27;
  return 1;
}

// Fallback static quotes for demo mode when API is unavailable
export const FALLBACK_QUOTES: Record<string, Quote> = {
  "AAPL.NASDAQ": { ticker: "AAPL", exchange: "NASDAQ", price: 229.31, change: 1.42, changePct: 0.62, currency: "USD" },
  "MSFT.NASDAQ": { ticker: "MSFT", exchange: "NASDAQ", price: 417.98, change: -2.14, changePct: -0.51, currency: "USD" },
  "NVDA.NASDAQ": { ticker: "NVDA", exchange: "NASDAQ", price: 128.25, change: 3.18, changePct: 2.55, currency: "USD" },
  "CDR.GPW": { ticker: "CDR", exchange: "GPW", price: 451.2, change: 5.4, changePct: 1.21, currency: "PLN" },
  "PKN.GPW": { ticker: "PKN", exchange: "GPW", price: 68.4, change: -0.6, changePct: -0.87, currency: "PLN" },
  "VOO.NYSE": { ticker: "VOO", exchange: "NYSE", price: 521.45, change: 0.88, changePct: 0.17, currency: "USD" },
};

export function fallbackQuote(ticker: string, exchange: string, currency: string): Quote {
  const key = `${ticker}.${exchange}`;
  const found = FALLBACK_QUOTES[key];
  if (found) return found;
  if (exchange === "GPW") return { ticker, exchange, price: 100, change: 0, changePct: 0, currency: "PLN" };
  return { ticker, exchange, price: 100, change: 0, changePct: 0, currency };
}

export function generateSyntheticHistory(asset: Asset, startPrice: number, days: number, baseCurrency: string): PricePoint[] {
  const points: PricePoint[] = [];
  const today = new Date();
  let price = startPrice;
  const seed = hashString(asset.ticker + asset.exchange);
  const trend = ((seed % 100) / 100 - 0.4) * 0.0008;
  const volatility = 0.012 + (seed % 7) * 0.002;
  const fxRate = asset.currency === baseCurrency ? 1 : fxApprox(asset.currency, baseCurrency);
  for (let i = days; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const noise = (mulberry32(seed + i)() - 0.5) * 2 * volatility;
    price = Math.max(0.5, price * (1 + trend + noise));
    points.push({
      date: d.toISOString().slice(0, 10),
      price: Number(price.toFixed(4)),
      price_base: Number((price * fxRate).toFixed(4)),
    });
  }
  return points;
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
