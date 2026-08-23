import { type ReactNode } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { classForChange } from "@/lib/format";

interface StatCardProps {
  label: string;
  value: string;
  change?: number;
  changeLabel?: string;
  icon?: ReactNode;
  accent?: "default" | "success" | "error";
}

export function StatCard({ label, value, change, changeLabel, icon, accent = "default" }: StatCardProps) {
  const positive = (change ?? 0) >= 0;
  return (
    <div className="card card-hover p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">{value}</p>
        </div>
        {icon && (
          <div className={`rounded-lg p-2 ${accent === "success" ? "bg-success-50 text-success-600 dark:bg-success-500/10 dark:text-success-400" : accent === "error" ? "bg-error-50 text-error-600 dark:bg-error-500/10 dark:text-error-400" : "bg-primary-50 text-primary-600 dark:bg-primary-500/10 dark:text-primary-400"}`}>
            {icon}
          </div>
        )}
      </div>
      {change !== undefined && (
        <div className="mt-3 flex items-center gap-1.5 text-sm">
          {positive ? <TrendingUp size={15} className={classForChange(change)} /> : <TrendingDown size={15} className={classForChange(change)} />}
          <span className={`font-medium ${classForChange(change)}`}>
            {positive ? "+" : ""}{change.toFixed(2)}%
          </span>
          {changeLabel && <span className="text-slate-400 dark:text-slate-500">{changeLabel}</span>}
        </div>
      )}
    </div>
  );
}
