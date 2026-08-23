import { type ReactNode, useEffect } from "react";
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from "lucide-react";

export type ToastKind = "success" | "error" | "info" | "warning";
export interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
}

interface ToastHostProps {
  toasts: Toast[];
  removeToast: (id: string) => void;
}

export function ToastHost({ toasts, removeToast }: ToastHostProps) {
  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onClose={() => removeToast(t.id)} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);
  const config: Record<ToastKind, { icon: ReactNode; bg: string; text: string }> = {
    success: { icon: <CheckCircle2 size={18} />, bg: "bg-success-600", text: "text-white" },
    error: { icon: <XCircle size={18} />, bg: "bg-error-600", text: "text-white" },
    info: { icon: <Info size={18} />, bg: "bg-primary-600", text: "text-white" },
    warning: { icon: <AlertTriangle size={18} />, bg: "bg-warning-500", text: "text-slate-900" },
  };
  const c = config[toast.kind];
  return (
    <div className={`flex items-center gap-3 rounded-lg ${c.bg} ${c.text} px-4 py-3 shadow-lg animate-slide-up`}>
      {c.icon}
      <span className="text-sm font-medium">{toast.message}</span>
      <button onClick={onClose} className="ml-2 opacity-70 hover:opacity-100">
        <X size={14} />
      </button>
    </div>
  );
}
