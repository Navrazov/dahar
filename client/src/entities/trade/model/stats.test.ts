import { describe, expect, it } from 'vitest'
import { row } from '@/shared/testing'
import { groupTrades, netPnl, tradingStats } from './stats'

const trade = (date: string, pnl: number | null, extra = {}) => row('trades', { date, pnl, ...extra })

describe('tradingStats', () => {
  const trades = [
    trade('2026-01-01', 100, { fees: 10, risk: 50, strategy: 'Пробой' }),
    trade('2026-01-02', -60, { risk: 30, strategy: 'Пробой' }),
    trade('2026-01-03', 200, { strategy: 'Отскок' }),
    trade('2026-01-04', null),
  ]
  const s = tradingStats(trades, 1000)

  it('counts only closed trades and nets out fees', () => {
    expect(s.count).toBe(4)
    expect(s.closed).toBe(3)
    expect(s.totalPnl).toBe(90 - 60 + 200)
    expect(s.balance).toBe(1230)
    expect(netPnl(trades[0])).toBe(90)
  })

  it('computes win rate, profit factor and R', () => {
    expect(s.winRate).toBeCloseTo(2 / 3)
    expect(s.profitFactor).toBeCloseTo(290 / 60)
    expect(s.avgR).toBeCloseTo((90 / 50 + -60 / 30) / 2)
  })

  it('tracks max drawdown from the equity peak', () => {
    expect(s.maxDrawdown).toBe(60)
    expect(s.maxDrawdownPct).toBeCloseTo(60 / 1090)
    expect(s.equity.map((e) => e.balance)).toEqual([1000, 1090, 1030, 1230])
  })

  it('handles an empty journal', () => {
    const empty = tradingStats([], 500)
    expect(empty).toMatchObject({ closed: 0, winRate: 0, totalPnl: 0, balance: 500, profitFactor: 0, avgR: null })
  })
})

describe('groupTrades', () => {
  it('groups by key, best first', () => {
    const groups = groupTrades(
      [trade('2026-01-01', 10, { strategy: 'A' }), trade('2026-01-02', 50, { strategy: 'B' }), trade('2026-01-03', -5, { strategy: 'A' })],
      (t) => t.strategy,
    )
    expect(groups.map((g) => [g.name, g.pnl, g.count])).toEqual([
      ['B', 50, 1],
      ['A', 5, 2],
    ])
  })
})
