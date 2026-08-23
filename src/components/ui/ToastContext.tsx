import { useState, useCallback, type ReactNode } from "react";
import { ToastHost, type Toast, type ToastKind } from "@/components/ui/Toast";

interface ToastContextValue {
  pushToast: (kind: ToastKind, message: string) => void;
}
import { createContext, useContext } from "react";
const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);
  const pushToast = useCallback((kind: ToastKind, message: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts((prev) => [...prev, { id, kind, message }]);
  }, []);
  return (
    <ToastContext.Provider value={{ pushToast }}>
      {children}
      <ToastHost toasts={toasts} removeToast={removeToast} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
