import { useState, type FormEvent } from "react";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/ToastContext";
import type { Portfolio } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string, baseCurrency: string) => Portfolio;
  onCreated: (portfolio: Portfolio) => void;
}

export function PortfolioCreateModal({ open, onClose, onCreate, onCreated }: Props) {
  const { pushToast } = useToast();
  const [name, setName] = useState("");
  const [baseCurrency, setBaseCurrency] = useState("PLN");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { pushToast("error", "Enter a portfolio name."); return; }
    const portfolio = onCreate(name.trim(), baseCurrency);
    pushToast("success", "Portfolio created.");
    setName("");
    onCreated(portfolio);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New Portfolio"
      subtitle="Each portfolio has its own base currency"
      size="sm"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSubmit}>Create</button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label">Portfolio Name</label>
          <input className="input" placeholder="e.g. Main, Retirement, Trading" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label">Base Currency</label>
          <select className="input" value={baseCurrency} onChange={(e) => setBaseCurrency(e.target.value)}>
            <option value="PLN">PLN — Polish Złoty</option>
            <option value="USD">USD — US Dollar</option>
            <option value="EUR">EUR — Euro</option>
            <option value="GBP">GBP — British Pound</option>
          </select>
          <p className="mt-1.5 text-xs text-slate-400">Foreign holdings are converted to this currency for reporting.</p>
        </div>
      </form>
    </Modal>
  );
}
