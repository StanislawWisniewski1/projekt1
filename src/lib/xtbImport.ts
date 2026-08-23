import * as XLSX from "xlsx";
import type { Transaction, TransactionType } from "./types";

export interface ParsedXtbRow {
  type: TransactionType;
  ticker: string;
  exchange: string;
  currency: string;
  date: string; // YYYY-MM-DD
  quantity: number;
  price: number;
  fee: number;
  note: string;
  name: string;
  raw: Record<string, string>;
}

export interface XtbParseResult {
  rows: ParsedXtbRow[];
  skipped: { reason: string; raw: Record<string, string> }[];
  sheetName: string;
}

/**
 * Parse an XTB broker statement (CSV or XLSX) into normalized trade rows.
 * XTB statements typically have columns like:
 *   ID, Type, Symbol, Comment, Volume, Open Time, Close Time, Open Price, Close Price, Profit, Currency, ...
 * Variants differ by region and year, so we normalize by matching column header keywords.
 *
 * Only Stocks and ETFs are kept; CFDs, Forex, Crypto, Indices etc. are skipped.
 */
export async function parseXtbFile(file: File): Promise<XtbParseResult> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  // Find the sheet that looks like the trades/positions sheet
  let sheetName = wb.SheetNames[0];
  for (const name of wb.SheetNames) {
    if (/trading|histor|stock|position|operatio/i.test(name)) {
      sheetName = name;
      break;
    }
  }
  const ws = wb.Sheets[sheetName];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
  return normalizeRows(json, sheetName);
}

function normalizeRows(rows: Record<string, unknown>[], sheetName: string): XtbParseResult {
  const result: XtbParseResult = { rows: [], skipped: [], sheetName };
  for (const raw of rows) {
    const norm = normalizeKeys(raw);
    const typeStr = String(norm.type || norm.operation || "").toUpperCase();
    if (!typeStr) {
      result.skipped.push({ reason: "Missing type", raw: stringify(raw) });
      continue;
    }
    // Filter out non-stock instruments
    if (/CFD|FOREX|FX|CRYPTO|INDEX|COMMODIT|FUTURES|OPTION/i.test(typeStr) ||
        /CFD|FOREX|FX|CRYPTO|INDEX|COMMODIT/i.test(String(norm.symbol || ""))) {
      result.skipped.push({ reason: "Non-stock instrument skipped", raw: stringify(raw) });
      continue;
    }

    const txType = mapXtbType(typeStr);
    if (!txType) {
      result.skipped.push({ reason: `Unrecognized type: ${typeStr}`, raw: stringify(raw) });
      continue;
    }

    const ticker = cleanTicker(String(norm.symbol || ""));
    if (!ticker) {
      result.skipped.push({ reason: "Missing symbol", raw: stringify(raw) });
      continue;
    }

    const { exchange, currency } = inferVenue(ticker, String(norm.currency || ""));
    const date = parseDate(norm.openTime || norm.closeTime || norm.time || norm.date);
    if (!date) {
      result.skipped.push({ reason: "Missing/unparseable date", raw: stringify(raw) });
      continue;
    }

    const quantity = Math.abs(parseFloat(String(norm.volume || norm.quantity || "0")));
    const price = parseFloat(String(norm.openPrice || norm.price || norm.closePrice || "0"));
    const fee = Math.abs(parseFloat(String(norm.fee || norm.commission || "0"))) || 0;

    result.rows.push({
      type: txType,
      ticker,
      exchange,
      currency,
      date,
      quantity: Number(quantity.toFixed(6)),
      price: Number(price.toFixed(6)),
      fee,
      note: `Imported from XTB: ${typeStr}`,
      name: String(norm.comment || norm.name || ""),
      raw: stringify(raw),
    });
  }
  return result;
}

function mapXtbType(typeStr: string): TransactionType | null {
  if (/BUY|OPEN LONG|OPEN BUY/.test(typeStr)) return "BUY";
  if (/SELL|CLOSE|OPEN SHORT|CLOSE SHORT/.test(typeStr)) return "SELL";
  if (/DIVIDEND|DIV/.test(typeStr)) return "DIVIDEND";
  if (/DEPOSIT|CASH IN|FUNDING/.test(typeStr)) return "CASH_IN";
  if (/WITHDRAW|CASH OUT/.test(typeStr)) return "CASH_OUT";
  return null;
}

function cleanTicker(s: string): string {
  // XTB often appends .US, .PL, .DE etc. to denote the market.
  return s.replace(/\.CFD$/i, "").trim().toUpperCase();
}

function inferVenue(ticker: string, currency: string): { exchange: string; currency: string } {
  const t = ticker.toUpperCase();
  if (t.endsWith(".PL")) return { exchange: "GPW", currency: currency || "PLN" };
  if (t.endsWith(".US") || currency === "USD") return { exchange: "NASDAQ", currency: "USD" };
  if (t.endsWith(".DE") || currency === "EUR") return { exchange: "XETRA", currency: "EUR" };
  if (t.endsWith(".L") || currency === "GBP") return { exchange: "LSE", currency: "GBP" };
  return { exchange: "UNKNOWN", currency: currency || "USD" };
}

function parseDate(s: string): string | null {
  if (!s) return null;
  // Try YYYY-MM-DD, DD.MM.YYYY, MM/DD/YYYY
  let d = new Date(s);
  if (isNaN(d.getTime())) {
    const m = s.match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/);
    if (m) {
      const day = parseInt(m[1]);
      const month = parseInt(m[2]);
      let year = parseInt(m[3]);
      if (year < 100) year += 2000;
      // ambiguous DD/MM vs MM/DD — prefer DD.MM (XTB is European)
      d = new Date(year, month - 1, day);
    }
  }
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function normalizeKeys(obj: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = k.toLowerCase().replace(/[^a-z0-9]/g, "");
    out[key] = String(v ?? "");
  }
  return out;
}

function stringify(obj: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) out[k] = String(v ?? "");
  return out;
}

// ---- FIFO matching engine ----

export interface FifoMatch {
  buyRow: ParsedXtbRow;
  sellRow: ParsedXtbRow;
  quantity: number;
  realizedPnl: number;
}

/**
 * FIFO matching: pair sells with earliest open buys of the same ticker.
 * Returns a list of matches. Buys remaining unmatched are open lots.
 */
export function runFifoMatching(rows: ParsedXtbRow[]): FifoMatch[] {
  const byTicker = new Map<string, ParsedXtbRow[]>();
  for (const r of rows) {
    const arr = byTicker.get(r.ticker) || [];
    arr.push(r);
    byTicker.set(r.ticker, arr);
  }
  const matches: FifoMatch[] = [];
  for (const [, tickerRows] of byTicker) {
    const sorted = [...tickerRows].sort((a, b) => a.date.localeCompare(b.date));
    const openLots: { row: ParsedXtbRow; remaining: number }[] = [];
    for (const row of sorted) {
      if (row.type === "BUY") {
        openLots.push({ row, remaining: row.quantity });
      } else if (row.type === "SELL") {
        let toClose = row.quantity;
        for (const lot of openLots) {
          if (toClose <= 0) break;
          if (lot.remaining <= 0) continue;
          const qty = Math.min(toClose, lot.remaining);
          const buyCost = lot.row.price + lot.row.fee / lot.row.quantity;
          const sellPrice = row.price - row.fee / row.quantity;
          const pnl = (sellPrice - buyCost) * qty;
          matches.push({ buyRow: lot.row, sellRow: row, quantity: qty, realizedPnl: pnl });
          lot.remaining -= qty;
          toClose -= qty;
        }
      }
    }
  }
  return matches;
}

/**
 * Produce a downloadable sample XTB CSV for testing the importer.
 */
export function sampleXtbCsv(): string {
  const header = "ID,Type,Symbol,Comment,Volume,Open Time,Close Time,Open Price,Close Price,Profit,Currency,Fee";
  const rows = [
    "1,BUY,AAPL.US,Apple Inc,10,2024-01-15 10:00:00,2024-01-15 10:00:00,185.20,0,0,USD,0.50",
    "2,SELL,AAPL.US,Apple Inc,5,2024-03-20 11:30:00,2024-03-20 11:30:00,171.50,0,0,USD,0.50",
    "3,BUY,CDR.PL,CD Projekt,20,2024-02-01 09:15:00,2024-02-01 09:15:00,120.40,0,0,PLN,3.20",
    "4,DIVIDEND,MSFT.US,Microsoft Dividend,0,2024-03-15 00:00:00,2024-03-15 00:00:00,0.62,0,6.20,USD,0",
    "5,DEPOSIT,,Cash deposit,0,2024-01-10 00:00:00,2024-01-10 00:00:00,5000,0,0,PLN,0",
    "6,BUY,VOO.US,Vanguard S&P 500,3,2024-01-20 13:00:00,2024-01-20 13:00:00,470.10,0,0,USD,1.00",
    "7,SELL,CDR.PL,CD Projekt,10,2024-05-10 14:00:00,2024-05-10 14:00:00,135.80,0,0,PLN,3.20",
  ];
  return [header, ...rows].join("\n");
}
