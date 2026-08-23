import { useMemo } from "react";
import type { Transaction, LotMatch, Holding } from "@/lib/types";
import { aggregateHoldings, computeLots, realizedPnlForAsset } from "@/lib/portfolio";
import { fxApprox } from "@/lib/marketData";
import { fallbackQuote } from "@/lib/marketData";

export interface PortfolioSummary {
  totalValue: number;
  totalCost: number;
  totalPnl: number;
  totalPnlPct: number;
  dayChange: number;
  dayChangePct: number;
  realizedPnl: number;
  holdings: Holding[];
  cashDeposited: number;
  cashWithdrawn: number;
  uninvestedCash: number;
  topGainers: Holding[];
  topLosers: Holding[];
}

export function usePortfolioSummary(
  transactions: Transaction[],
  lotMatches: LotMatch[],
  baseCurrency: string,
  portfolioId: string,
): PortfolioSummary {
  return useMemo(() => {
    const txs = transactions.filter((t) => t.portfolio_id === portfolioId);
    const holdingsMap = aggregateHoldings(txs);
    const holdings: Holding[] = [];
    let totalValue = 0;
    let totalCost = 0;
    let dayChange = 0;

    for (const [, h] of holdingsMap) {
      if (h.quantity <= 0.000001) continue;
      const asset = h.asset;
      const lots = computeLots(txs, lotMatches, asset.id);
      const openLots = lots.filter((l) => l.remainingQuantity > 0.000001);
      let costBasis = 0;
      let qtyForCost = 0;
      for (const lot of openLots) {
        const unitCost = Number(lot.buyTransaction.price) + Number(lot.buyTransaction.fee) / Number(lot.buyTransaction.quantity);
        costBasis += unitCost * lot.remainingQuantity;
        qtyForCost += lot.remainingQuantity;
      }
      const avgCost = qtyForCost > 0 ? costBasis / qtyForCost : 0;

      const fb = fallbackQuote(asset.ticker, asset.exchange, asset.currency);
      const marketPrice = fb.price;
      const marketValue = marketPrice * h.quantity;
      const fx = fxApprox(asset.currency, baseCurrency);
      const marketValueBase = marketValue * fx;
      const costBasisBase = costBasis * fx;
      const unrealizedPnl = marketValueBase - costBasisBase;
      const unrealizedPnlPct = costBasisBase > 0 ? (unrealizedPnl / costBasisBase) * 100 : 0;
      const dayChangeAmt = fb.change * h.quantity * fx;

      holdings.push({
        asset,
        quantity: h.quantity,
        avgCost,
        costBasis: costBasisBase,
        marketPrice,
        marketValue: marketValueBase,
        dayChange: dayChangeAmt,
        dayChangePct: fb.changePct,
        unrealizedPnl,
        unrealizedPnlPct,
        currency: asset.currency,
        allocationPct: 0,
      });
      totalValue += marketValueBase;
      totalCost += costBasisBase;
      dayChange += dayChangeAmt;
    }

    holdings.sort((a, b) => b.marketValue - a.marketValue);
    for (const h of holdings) h.allocationPct = totalValue > 0 ? (h.marketValue / totalValue) * 100 : 0;

    const realized = holdings.reduce((s, h) => s + realizedPnlForAsset(txs, lotMatches, h.asset.id) * fxApprox(h.currency, baseCurrency), 0);
    const cashDeposited = txs.filter((t) => t.type === "CASH_IN").reduce((s, t) => s + Number(t.price) * fxApprox(t.currency, baseCurrency), 0);
    const cashWithdrawn = txs.filter((t) => t.type === "CASH_OUT").reduce((s, t) => s + Number(t.price) * fxApprox(t.currency, baseCurrency), 0);
    const dividends = txs.filter((t) => t.type === "DIVIDEND").reduce((s, t) => s + Number(t.price) * fxApprox(t.currency, baseCurrency), 0);

    // Un-invested cash = deposits - withdrawals - buys + sells + dividends (in base currency)
    const buysTotal = txs.filter((t) => t.type === "BUY").reduce((s, t) => s + (Number(t.quantity) * Number(t.price) + Number(t.fee)) * fxApprox(t.currency, baseCurrency), 0);
    const sellsTotal = txs.filter((t) => t.type === "SELL").reduce((s, t) => s + (Number(t.quantity) * Number(t.price) - Number(t.fee)) * fxApprox(t.currency, baseCurrency), 0);
    const uninvestedCash = cashDeposited - cashWithdrawn - buysTotal + sellsTotal + dividends;

    const topGainers = [...holdings].filter((h) => h.dayChangePct !== 0).sort((a, b) => b.dayChangePct - a.dayChangePct).slice(0, 3);
    const topLosers = [...holdings].filter((h) => h.dayChangePct !== 0).sort((a, b) => a.dayChangePct - b.dayChangePct).slice(0, 3);

    return {
      totalValue,
      totalCost,
      totalPnl: totalValue - totalCost,
      totalPnlPct: totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0,
      dayChange,
      dayChangePct: totalValue - dayChange > 0 ? (dayChange / (totalValue - dayChange)) * 100 : 0,
      realizedPnl: realized,
      holdings,
      cashDeposited,
      cashWithdrawn,
      uninvestedCash,
      topGainers,
      topLosers,
    };
  }, [transactions, lotMatches, baseCurrency, portfolioId]);
}

export { fxApprox, fallbackQuote };
