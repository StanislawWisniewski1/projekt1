import { useState, useEffect, useRef, useMemo, type FormEvent } from "react";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/ToastContext";
import type { Portfolio, Asset, Transaction, TransactionType } from "@/lib/types";
import { fetchQuote, fallbackQuote } from "@/lib/marketData";
import { POPULAR_TICKERS, type TickerCatalogItem } from "@/lib/tickerCatalog";
import { formatCurrency } from "@/lib/format";
import { Loader2, Sparkles, RefreshCw, Search, Check, Plus, X } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  portfolio: Portfolio;
  assets: Asset[];
  defaultType?: TransactionType;
  defaultAssetId?: string;
  onSave: (tx: Omit<Transaction, "id" | "created_at" | "asset">) => void;
  onCreateAsset: (ticker: string, exchange: string, currency: string, name: string, type: string) => Asset;
}

const TYPES: { value: TransactionType; label: string; needsAsset: boolean; needsQty: boolean; needsPrice: boolean }[] = [
  { value: "BUY", label: "Buy", needsAsset: true, needsQty: true, needsPrice: true },
  { value: "SELL", label: "Sell", needsAsset: true, needsQty: true, needsPrice: true },
  { value: "DIVIDEND", label: "Dividend", needsAsset: true, needsQty: false, needsPrice: true },
  { value: "CASH_IN", label: "Cash Deposit", needsAsset: false, needsQty: false, needsPrice: true },
  { value: "CASH_OUT", label: "Cash Withdrawal", needsAsset: false, needsQty: false, needsPrice: true },
];

interface SelectedTickerInfo {
  assetId?: string; // If already existing in user's assets
  ticker: string;
  exchange: string;
  currency: string;
  name: string;
  type: string;
  isNew: boolean;
}

export function TransactionFormModal({ open, onClose, portfolio, assets, defaultType = "BUY", defaultAssetId, onSave, onCreateAsset }: Props) {
  const { pushToast } = useToast();
  const [type, setType] = useState<TransactionType>(defaultType);
  const [selectedTicker, setSelectedTicker] = useState<SelectedTickerInfo | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  // Custom asset creation fields (when custom ticker selected)
  const [customExchange, setCustomExchange] = useState("NASDAQ");
  const [customCurrency, setCustomCurrency] = useState("USD");

  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [fee, setFee] = useState("0");
  const [note, setNote] = useState("");
  const [priceLoading, setPriceLoading] = useState(false);
  const [fetchedPrice, setFetchedPrice] = useState<number | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const quantityInputRef = useRef<HTMLInputElement>(null);

  const cfg = TYPES.find((t) => t.value === type)!;
  const activeCurrency = selectedTicker ? selectedTicker.currency : portfolio.base_currency;

  // Build combined catalog of all existing assets + popular market tickers
  const allAvailableTickers = useMemo(() => {
    const map = new Map<string, TickerCatalogItem & { existingAssetId?: string; inPortfolio?: boolean }>();

    // 1. Add existing user assets first
    for (const a of assets) {
      const key = `${a.ticker.toUpperCase()}|${a.exchange.toUpperCase()}`;
      map.set(key, {
        ticker: a.ticker.toUpperCase(),
        name: a.name || a.ticker,
        exchange: a.exchange,
        currency: a.currency,
        type: (a.type as "stock" | "etf") || "stock",
        existingAssetId: a.id,
        inPortfolio: true,
      });
    }

    // 2. Add popular tickers from catalog if not already added
    for (const item of POPULAR_TICKERS) {
      const key = `${item.ticker.toUpperCase()}|${item.exchange.toUpperCase()}`;
      if (!map.has(key)) {
        map.set(key, {
          ...item,
          inPortfolio: false,
        });
      }
    }

    return Array.from(map.values());
  }, [assets]);

  // Filter and prioritize matching tickers
  const filteredTickers = useMemo(() => {
    const q = searchQuery.trim().toUpperCase();
    if (!q) {
      // If empty search, return existing portfolio assets first, then popular US/GPW items
      return allAvailableTickers.slice(0, 8);
    }

    const exactPrefix: typeof allAvailableTickers = [];
    const namePrefix: typeof allAvailableTickers = [];
    const tickerContains: typeof allAvailableTickers = [];
    const nameContains: typeof allAvailableTickers = [];

    for (const item of allAvailableTickers) {
      const t = item.ticker.toUpperCase();
      const n = (item.name || "").toUpperCase();
      if (t.startsWith(q)) {
        exactPrefix.push(item);
      } else if (n.startsWith(q)) {
        namePrefix.push(item);
      } else if (t.includes(q)) {
        tickerContains.push(item);
      } else if (n.includes(q)) {
        nameContains.push(item);
      }
    }

    // Sort exact prefix matches by length so closest ticker matches come first
    exactPrefix.sort((a, b) => a.ticker.length - b.ticker.length || a.ticker.localeCompare(b.ticker));

    return [...exactPrefix, ...namePrefix, ...tickerContains, ...nameContains].slice(0, 10);
  }, [allAvailableTickers, searchQuery]);

  // Sync defaultType or defaultAssetId when modal opens
  useEffect(() => {
    if (open) {
      setType(defaultType);
      if (defaultAssetId) {
        const found = assets.find((a) => a.id === defaultAssetId);
        if (found) {
          selectItem({
            ticker: found.ticker,
            exchange: found.exchange,
            currency: found.currency,
            name: found.name || found.ticker,
            type: (found.type as "stock" | "etf") || "stock",
            existingAssetId: found.id,
          });
        }
      } else if (!selectedTicker && assets.length > 0) {
        const first = assets[0];
        selectItem({
          ticker: first.ticker,
          exchange: first.exchange,
          currency: first.currency,
          name: first.name || first.ticker,
          type: (first.type as "stock" | "etf") || "stock",
          existingAssetId: first.id,
        });
      }
    }
  }, [open, defaultType, defaultAssetId]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          searchInputRef.current && !searchInputRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch current market price for a given ticker & exchange
  const loadMarketPrice = async (ticker: string, exchange: string, assetCcy: string) => {
    if (!ticker) return;
    setPriceLoading(true);
    try {
      const q = await fetchQuote(ticker, exchange);
      const latestQuote = q || fallbackQuote(ticker, exchange, assetCcy);
      if (latestQuote && latestQuote.price > 0) {
        setPrice(String(latestQuote.price));
        setFetchedPrice(latestQuote.price);
      }
    } catch {
      const fallback = fallbackQuote(ticker, exchange, assetCcy);
      if (fallback && fallback.price > 0) {
        setPrice(String(fallback.price));
        setFetchedPrice(fallback.price);
      }
    } finally {
      setPriceLoading(false);
    }
  };

  const selectItem = (item: TickerCatalogItem & { existingAssetId?: string }) => {
    const info: SelectedTickerInfo = {
      assetId: item.existingAssetId,
      ticker: item.ticker.toUpperCase(),
      exchange: item.exchange,
      currency: item.currency,
      name: item.name || item.ticker,
      type: item.type || "stock",
      isNew: !item.existingAssetId,
    };
    setSelectedTicker(info);
    setSearchQuery("");
    setDropdownOpen(false);
    loadMarketPrice(info.ticker, info.exchange, info.currency);

    // Focus quantity input for fast entry
    setTimeout(() => quantityInputRef.current?.focus(), 50);
  };

  const selectCustomTicker = () => {
    const q = searchQuery.trim().toUpperCase();
    if (!q) return;

    // Infer venue & currency based on suffix or query
    let ex = customExchange;
    let ccy = customCurrency;
    if (q.endsWith(".PL")) { ex = "GPW"; ccy = "PLN"; }
    else if (q.endsWith(".DE")) { ex = "XETRA"; ccy = "EUR"; }
    else if (q.endsWith(".L")) { ex = "LSE"; ccy = "GBP"; }

    const clean = q.replace(/\.(PL|US|DE|L)$/i, "");
    const existing = assets.find((a) => a.ticker.toUpperCase() === clean && a.exchange.toUpperCase() === ex);

    selectItem({
      ticker: clean,
      name: clean,
      exchange: ex,
      currency: ccy,
      type: "stock",
      existingAssetId: existing?.id,
    });
  };

  // Keyboard navigation inside search dropdown
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!dropdownOpen) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        setDropdownOpen(true);
      }
      return;
    }

    const totalItems = filteredTickers.length + (searchQuery.trim() ? 1 : 0);

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev + 1) % Math.max(1, totalItems));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev - 1 + totalItems) % Math.max(1, totalItems));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightedIndex < filteredTickers.length) {
        selectItem(filteredTickers[highlightedIndex]);
      } else if (searchQuery.trim()) {
        selectCustomTicker();
      }
    } else if (e.key === "Escape") {
      setDropdownOpen(false);
    }
  };

  const handleClearSelection = () => {
    setSelectedTicker(null);
    setSearchQuery("");
    setPrice("");
    setFetchedPrice(null);
    setTimeout(() => searchInputRef.current?.focus(), 50);
  };

  const reset = () => {
    setType(defaultType);
    setSelectedTicker(null);
    setSearchQuery("");
    setDropdownOpen(false);
    setDate(new Date().toISOString().slice(0, 10));
    setQuantity("");
    setPrice("");
    setFee("0");
    setNote("");
    setFetchedPrice(null);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (cfg.needsAsset && !selectedTicker) {
      pushToast("error", "Please search and select a ticker.");
      searchInputRef.current?.focus();
      return;
    }
    if (cfg.needsPrice && !price) { pushToast("error", "Enter a price / amount."); return; }
    if (cfg.needsQty && !quantity) { pushToast("error", "Enter a quantity."); return; }

    let finalAssetId: string | null = null;
    if (cfg.needsAsset && selectedTicker) {
      if (selectedTicker.assetId) {
        finalAssetId = selectedTicker.assetId;
      } else {
        const created = onCreateAsset(
          selectedTicker.ticker,
          selectedTicker.exchange,
          selectedTicker.currency,
          selectedTicker.name || selectedTicker.ticker,
          selectedTicker.type || "stock",
        );
        finalAssetId = created.id;
      }
    }

    onSave({
      portfolio_id: portfolio.id,
      asset_id: cfg.needsAsset ? finalAssetId : null,
      type,
      date,
      quantity: cfg.needsQty ? Number(quantity) : 0,
      price: Number(price),
      fee: Number(fee) || 0,
      currency: type === "CASH_IN" || type === "CASH_OUT" ? portfolio.base_currency : activeCurrency,
      note: note || null,
    });
    reset();
    onClose();
  };

  // Calculate estimated total for preview
  const numQty = parseFloat(quantity) || 0;
  const numPrice = parseFloat(price) || 0;
  const numFee = parseFloat(fee) || 0;
  const estimatedTotal = type === "BUY"
    ? numQty * numPrice + numFee
    : type === "SELL"
    ? numQty * numPrice - numFee
    : numPrice;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Record Transaction"
      subtitle={`${portfolio.name} · base currency ${portfolio.base_currency}`}
      size="md"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSubmit}>Save transaction</button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Transaction Type Picker */}
        <div>
          <label className="label">Type</label>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setType(t.value)}
                className={`rounded-lg border px-2 py-2 text-xs font-medium transition-colors ${type === t.value ? "border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-500/10 dark:text-primary-400" : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Unified Searchable Ticker Selector */}
        {cfg.needsAsset && (
          <div className="relative">
            <label className="label">Asset / Ticker</label>

            {selectedTicker ? (
              <div className="flex items-center justify-between rounded-xl border border-primary-200 bg-primary-50/60 p-3 dark:border-primary-500/30 dark:bg-primary-500/10">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-600 text-xs font-bold text-white shadow-sm">
                    {selectedTicker.ticker.slice(0, 3)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 dark:text-slate-100">{selectedTicker.ticker}</span>
                      <span className="badge bg-white text-slate-600 shadow-sm dark:bg-slate-800 dark:text-slate-300">
                        {selectedTicker.exchange}
                      </span>
                      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                        {selectedTicker.currency}
                      </span>
                    </div>
                    <div className="truncate text-xs text-slate-600 dark:text-slate-400 max-w-[240px] sm:max-w-xs">
                      {selectedTicker.name}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleClearSelection}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                  title="Change ticker"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <div className="relative">
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    className="input pl-9 pr-8 font-medium placeholder:font-normal"
                    placeholder="Type ticker symbol or name (e.g. AAPL, CDR, NVDA, VOO)..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setDropdownOpen(true);
                      setHighlightedIndex(0);
                    }}
                    onFocus={() => setDropdownOpen(true)}
                    onKeyDown={handleKeyDown}
                    autoComplete="off"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => { setSearchQuery(""); searchInputRef.current?.focus(); }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                {/* Instant Search Results Dropdown */}
                {dropdownOpen && (
                  <div
                    ref={dropdownRef}
                    className="absolute z-50 mt-1.5 max-h-72 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-800 dark:bg-slate-900"
                  >
                    <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      {searchQuery ? `Matching Tickers (${filteredTickers.length})` : "Available Tickers"}
                    </div>

                    {filteredTickers.length === 0 && !searchQuery.trim() ? (
                      <div className="p-3 text-center text-xs text-slate-400">
                        Type any ticker symbol (e.g. AAPL, CDR, NVDA)
                      </div>
                    ) : (
                      filteredTickers.map((item, index) => {
                        const isHighlighted = highlightedIndex === index;
                        return (
                          <div
                            key={`${item.ticker}-${item.exchange}`}
                            onClick={() => selectItem(item)}
                            onMouseEnter={() => setHighlightedIndex(index)}
                            className={`flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
                              isHighlighted
                                ? "bg-primary-50 text-primary-900 dark:bg-primary-500/15 dark:text-primary-200"
                                : "text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800/60"
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <span className="font-bold tracking-wide">{item.ticker}</span>
                              <span className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[170px] sm:max-w-[220px]">
                                {item.name}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              {item.inPortfolio && (
                                <span className="badge bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400 text-[10px]">
                                  Portfolio
                                </span>
                              )}
                              <span className="badge bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 text-[10px]">
                                {item.exchange}
                              </span>
                              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                                {item.currency}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    )}

                    {/* Add Custom Ticker Option */}
                    {searchQuery.trim() && (
                      <div
                        onClick={selectCustomTicker}
                        onMouseEnter={() => setHighlightedIndex(filteredTickers.length)}
                        className={`mt-1 flex cursor-pointer items-center justify-between rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm dark:border-slate-700 ${
                          highlightedIndex === filteredTickers.length
                            ? "border-primary-500 bg-primary-50/70 text-primary-900 dark:bg-primary-500/15 dark:text-primary-200"
                            : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800/60"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Plus size={15} className="text-primary-600 dark:text-primary-400" />
                          <span>Use custom ticker <strong className="font-semibold text-slate-900 dark:text-slate-100">"{searchQuery.trim().toUpperCase()}"</strong></span>
                        </div>
                        <span className="text-xs text-slate-400">Press Enter ↵</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Date, Quantity, Price, Fee Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Date</label>
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          {cfg.needsQty && (
            <div>
              <label className="label">Quantity</label>
              <input
                ref={quantityInputRef}
                type="number"
                step="any"
                className="input"
                placeholder="0"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
          )}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="label mb-0">
                {type === "DIVIDEND" || type === "CASH_IN" || type === "CASH_OUT" ? "Amount" : "Price per share"}
              </label>
              {(type === "BUY" || type === "SELL") && (
                <div className="flex items-center gap-1.5">
                  {priceLoading ? (
                    <span className="flex items-center gap-1 text-[11px] text-slate-400">
                      <Loader2 size={11} className="animate-spin" /> Fetching…
                    </span>
                  ) : fetchedPrice != null ? (
                    <button
                      type="button"
                      onClick={() => setPrice(String(fetchedPrice))}
                      className="flex items-center gap-0.5 text-[11px] font-medium text-primary-600 hover:underline dark:text-primary-400"
                      title="Reset to current market price"
                    >
                      <Sparkles size={10} /> Market: {formatCurrency(fetchedPrice, activeCurrency)}
                    </button>
                  ) : null}
                </div>
              )}
            </div>
            <div className="relative">
              <input
                type="number"
                step="any"
                className="input pr-8"
                placeholder="0.00"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
              {(type === "BUY" || type === "SELL") && selectedTicker && (
                <button
                  type="button"
                  onClick={() => loadMarketPrice(selectedTicker.ticker, selectedTicker.exchange, selectedTicker.currency)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  title="Refresh market price"
                >
                  <RefreshCw size={13} className={priceLoading ? "animate-spin" : ""} />
                </button>
              )}
            </div>
            {(type === "BUY" || type === "SELL") && (
              <p className="mt-1 text-[11px] text-slate-400">
                Auto-filled with current market price. Editable manually.
              </p>
            )}
          </div>
          <div>
            <label className="label">Fee / Commission</label>
            <input type="number" step="any" className="input" placeholder="0.00" value={fee} onChange={(e) => setFee(e.target.value)} />
          </div>
        </div>

        <div>
          <label className="label">Note (optional)</label>
          <input className="input" placeholder="e.g. limit order, monthly investment" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>

        {/* Currency and Total Preview */}
        <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3.5 py-2.5 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
          <div>
            <span>Currency: </span>
            <span className="font-semibold text-slate-900 dark:text-slate-100">{activeCurrency}</span>
          </div>
          {numQty > 0 && numPrice > 0 && (
            <div className="text-right">
              <span className="text-slate-400">Est. Total: </span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {formatCurrency(estimatedTotal, activeCurrency)}
              </span>
            </div>
          )}
        </div>
      </form>
    </Modal>
  );
}
