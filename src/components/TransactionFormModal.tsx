import { useState, type FormEvent } from "react";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/ToastContext";
import type { Portfolio, Asset, Transaction, TransactionType } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  portfolio: Portfolio;
  assets: Asset[];
  defaultType?: TransactionType;
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

export function TransactionFormModal({ open, onClose, portfolio, assets, defaultType = "BUY", onSave, onCreateAsset }: Props) {
  const { pushToast } = useToast();
  const [type, setType] = useState<TransactionType>(defaultType);
  const [assetId, setAssetId] = useState("");
  const [newTicker, setNewTicker] = useState("");
  const [newExchange, setNewExchange] = useState("NASDAQ");
  const [newCurrency, setNewCurrency] = useState("USD");
  const [createAsset, setCreateAsset] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [fee, setFee] = useState("0");
  const [note, setNote] = useState("");

  const cfg = TYPES.find((t) => t.value === type)!;
  const currency = createAsset ? newCurrency : (assets.find((a) => a.id === assetId)?.currency || portfolio.base_currency);

  const reset = () => {
    setType(defaultType);
    setAssetId(""); setNewTicker(""); setNewExchange("NASDAQ"); setNewCurrency("USD");
    setCreateAsset(false); setDate(new Date().toISOString().slice(0, 10));
    setQuantity(""); setPrice(""); setFee("0"); setNote("");
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (cfg.needsAsset && !createAsset && !assetId) { pushToast("error", "Select an asset or create a new one."); return; }
    if (cfg.needsAsset && createAsset && !newTicker.trim()) { pushToast("error", "Enter a ticker symbol."); return; }
    if (cfg.needsPrice && !price) { pushToast("error", "Enter a price / amount."); return; }
    if (cfg.needsQty && !quantity) { pushToast("error", "Enter a quantity."); return; }

    let finalAssetId: string | null = assetId || null;
    if (cfg.needsAsset && createAsset) {
      const a = onCreateAsset(newTicker.toUpperCase(), newExchange, newCurrency, newTicker.toUpperCase(), "stock");
      finalAssetId = a.id;
    }

    onSave({
      portfolio_id: portfolio.id,
      asset_id: cfg.needsAsset ? finalAssetId : null,
      type,
      date,
      quantity: cfg.needsQty ? Number(quantity) : 0,
      price: Number(price),
      fee: Number(fee) || 0,
      currency: type === "CASH_IN" || type === "CASH_OUT" ? portfolio.base_currency : currency,
      note: note || null,
    });
    reset();
    onClose();
  };

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

        {cfg.needsAsset && (
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="label mb-0">Asset</label>
              <button type="button" onClick={() => setCreateAsset((v) => !v)} className="text-xs font-medium text-primary-600 hover:underline dark:text-primary-400">
                {createAsset ? "Choose existing" : "Add new ticker"}
              </button>
            </div>
            {createAsset ? (
              <div className="grid grid-cols-3 gap-2">
                <input className="input col-span-1" placeholder="Ticker" value={newTicker} onChange={(e) => setNewTicker(e.target.value)} />
                <select className="input" value={newExchange} onChange={(e) => setNewExchange(e.target.value)}>
                  <option value="NASDAQ">NASDAQ</option>
                  <option value="NYSE">NYSE</option>
                  <option value="GPW">GPW (Warsaw)</option>
                  <option value="XETRA">XETRA</option>
                  <option value="LSE">LSE</option>
                  <option value="UNKNOWN">Other</option>
                </select>
                <select className="input" value={newCurrency} onChange={(e) => setNewCurrency(e.target.value)}>
                  <option value="USD">USD</option>
                  <option value="PLN">PLN</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                </select>
              </div>
            ) : (
              <select className="input" value={assetId} onChange={(e) => setAssetId(e.target.value)}>
                <option value="">Select an asset…</option>
                {assets.map((a) => (
                  <option key={a.id} value={a.id}>{a.ticker} · {a.exchange} ({a.currency})</option>
                ))}
              </select>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Date</label>
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          {cfg.needsQty && (
            <div>
              <label className="label">Quantity</label>
              <input type="number" step="any" className="input" placeholder="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </div>
          )}
          <div>
            <label className="label">{type === "DIVIDEND" || type === "CASH_IN" || type === "CASH_OUT" ? "Amount" : "Price"}</label>
            <input type="number" step="any" className="input" placeholder="0.00" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <div>
            <label className="label">Fee / Commission</label>
            <input type="number" step="any" className="input" placeholder="0.00" value={fee} onChange={(e) => setFee(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label">Note (optional)</label>
          <input className="input" placeholder="e.g. limit order, dividend Q1" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
          Currency: {currency}
        </div>
      </form>
    </Modal>
  );
}
