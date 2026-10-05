import { useState } from 'react'
import clsx from 'clsx'
import { Plus } from 'lucide-react'
import type { Partner } from '@/shared/api'
import { money } from '@/shared/lib'
import { Badge, StatusPicker } from '@/shared/ui'
import { partnerStatuses, usePartnerTotals } from '@/entities/partner'
import { useEditor } from '@/features/edit-record'
import { NextAction } from './NextAction'

/** Воронка: колонки по этапам, карточки перетаскиваются между ними. */
export function PartnersBoard({
  partners,
  cur,
  onOpen,
  onStatus,
}: {
  partners: Partner[]
  cur: string
  onOpen: (id: number) => void
  onStatus: (id: number, status: string) => void
}) {
  const edit = useEditor()
  const totals = usePartnerTotals()
  const [dragId, setDragId] = useState<number | null>(null)

  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="flex gap-3">
        {partnerStatuses.map((s) => {
          const col = partners.filter((p) => (p.status || 'new') === s.value)
          return (
            <div
              key={s.value}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragId) onStatus(dragId, s.value)
                setDragId(null)
              }}
              className="flex w-64 shrink-0 flex-col rounded-[10px] border border-line bg-surface-2/50"
            >
              <div className="flex items-center justify-between px-3 py-2.5">
                <Badge tone={s.tone}>{s.label}</Badge>
                <span className="text-[12.5px] text-fg-3">{col.length}</span>
              </div>
              <div className="flex min-h-24 flex-col gap-2 px-2 pb-2">
                {col.map((p) => {
                  const t = totals(p.id)
                  return (
                    <div
                      key={p.id}
                      draggable
                      onDragStart={() => setDragId(p.id)}
                      onDragEnd={() => setDragId(null)}
                      onClick={() => onOpen(p.id)}
                      className={clsx(
                        'cursor-pointer rounded-[9px] border border-line bg-surface p-3 shadow-[0_1px_2px_rgb(0_0_0/0.04)] transition-shadow hover:shadow-md',
                        dragId === p.id && 'opacity-50',
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-[13.5px] font-medium">{p.name}</div>
                          {p.company && <div className="truncate text-[12.5px] text-fg-3">{p.company}</div>}
                        </div>
                        <StatusPicker value={p.status || 'new'} options={partnerStatuses} onChange={(v) => onStatus(p.id, v)} label="Этап" compact />
                      </div>
                      {(t.applications > 0 || t.turnover > 0) && (
                        <div className="mt-2 flex gap-3 text-[12px] text-fg-2 tabular">
                          {t.applications > 0 && <span>{t.applications} заяв.</span>}
                          {t.approvals > 0 && <span>{t.approvals} одобр.</span>}
                          {t.turnover > 0 && <span>{money(t.turnover, cur)}</span>}
                        </div>
                      )}
                      <NextAction p={p} />
                    </div>
                  )
                })}
                <button
                  type="button"
                  onClick={() => edit('partners', { status: s.value })}
                  className="flex h-7 items-center justify-center gap-1 rounded-[7px] text-[12.5px] text-fg-3 hover:bg-hover hover:text-fg"
                >
                  <Plus size={12} /> Добавить
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
