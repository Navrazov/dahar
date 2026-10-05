import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import type { Trade } from '@/shared/api'
import { parse, sum } from '@/shared/lib'

export interface TradingStats {
  count: number
  closed: number
  wins: number
  losses: number
  winRate: number
  totalPnl: number
  avgWin: number
  avgLoss: number
  bestTrade: number
  worstTrade: number
  profitFactor: number
  expectancy: number
  avgR: number | null
  balance: number
  maxDrawdown: number
  maxDrawdownPct: number
  equity: { date: string; label: string; balance: number }[]
}

export const netPnl = (t: Trade) => (t.pnl ?? 0) - (t.fees ?? 0)

export function tradingStats(trades: Trade[], startBalance: number): TradingStats {
  const closed = trades.filter((t) => t.pnl != null).sort((a, b) => (a.date + a.id).localeCompare(b.date + b.id))
  const pnls = closed.map(netPnl)
  const wins = pnls.filter((p) => p > 0)
  const losses = pnls.filter((p) => p < 0)
  const grossWin = sum(wins)
  const grossLoss = Math.abs(sum(losses))
  const withR = closed.filter((t) => t.risk && t.risk > 0)

  let bal = startBalance
  let peak = startBalance
  let maxDd = 0
  let maxDdPct = 0
  const equity = [{ date: '', label: 'Старт', balance: startBalance }]
  closed.forEach((t, i) => {
    bal += pnls[i]
    peak = Math.max(peak, bal)
    const dd = peak - bal
    if (dd > maxDd) maxDd = dd
    if (peak > 0) maxDdPct = Math.max(maxDdPct, dd / peak)
    equity.push({ date: t.date, label: format(parse(t.date) ?? new Date(), 'd MMM', { locale: ru }), balance: bal })
  })

  return {
    count: trades.length,
    closed: closed.length,
    wins: wins.length,
    losses: losses.length,
    winRate: closed.length ? wins.length / closed.length : 0,
    totalPnl: sum(pnls),
    avgWin: wins.length ? grossWin / wins.length : 0,
    avgLoss: losses.length ? -grossLoss / losses.length : 0,
    bestTrade: pnls.length ? Math.max(...pnls) : 0,
    worstTrade: pnls.length ? Math.min(...pnls) : 0,
    profitFactor: grossLoss ? grossWin / grossLoss : grossWin ? Infinity : 0,
    expectancy: closed.length ? sum(pnls) / closed.length : 0,
    avgR: withR.length ? sum(withR.map((t) => netPnl(t) / t.risk!)) / withR.length : null,
    balance: bal,
    maxDrawdown: maxDd,
    maxDrawdownPct: maxDdPct,
    equity,
  }
}

export function groupTrades(trades: Trade[], key: (t: Trade) => string | null) {
  const map = new Map<string, Trade[]>()
  for (const t of trades) {
    if (t.pnl == null) continue
    const k = key(t) || 'Без названия'
    map.set(k, [...(map.get(k) || []), t])
  }
  return [...map.entries()]
    .map(([name, ts]) => ({
      name,
      count: ts.length,
      pnl: sum(ts.map(netPnl)),
      winRate: ts.filter((t) => netPnl(t) > 0).length / ts.length,
    }))
    .sort((a, b) => b.pnl - a.pnl)
}
