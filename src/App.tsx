import { ThemeProvider, useTheme } from "@/context/ThemeContext";
import { DataProvider } from "@/context/DataContext";
import { ToastProvider } from "@/components/ui/ToastContext";
import { Dashboard } from "@/components/Dashboard";
import { LineChart, Sun, Moon } from "lucide-react";

function Shell() {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/80 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/80">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg bg-primary-600 p-1.5 text-white">
              <LineChart size={18} />
            </div>
            <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">Folio</span>
            <span className="hidden text-xs font-medium text-slate-400 sm:inline">Investment Portfolio Tracker</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={toggleTheme} className="btn-ghost p-2" aria-label="Toggle theme">
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <Dashboard />
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <DataProvider>
        <ToastProvider>
          <Shell />
        </ToastProvider>
      </DataProvider>
    </ThemeProvider>
  );
}
