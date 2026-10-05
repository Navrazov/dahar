import { useMemo } from 'react'
import { useList } from '@/shared/api'

export interface PartnerTotals {
  applications: number
  approvals: number
  turnover: number
  profit: number
  lastReport: string | null
}

const EMPTY_TOTALS: PartnerTotals = { applications: 0, approvals: 0, turnover: 0, profit: 0, lastReport: null }

export function usePartnerTotals(): (id: number) => PartnerTotals {
  const reports = useList('partner_reports')
  const map = useMemo(() => {
    const m = new Map<number, PartnerTotals>()
    for (const r of reports) {
      const t = m.get(r.partner_id) ?? { ...EMPTY_TOTALS }
      t.applications += r.applications || 0
      t.approvals += r.approvals || 0
      t.turnover += r.turnover || 0
      t.profit += r.profit || 0
      if (!t.lastReport || r.date > t.lastReport) t.lastReport = r.date
      m.set(r.partner_id, t)
    }
    return m
  }, [reports])
  return (id) => map.get(id) ?? EMPTY_TOTALS
}
