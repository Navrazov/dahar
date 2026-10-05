import { useState } from 'react'
import clsx from 'clsx'
import { Clapperboard, Plus } from 'lucide-react'
import { type ContentStatus, useList, useSave } from '@/shared/api'
import { num, relDate, todayStr } from '@/shared/lib'
import { Badge, StatusPicker } from '@/shared/ui'
import { contentStatuses } from '@/entities/business'
import { useEditor } from '@/features/edit-record'

export function ContentBoard() {
  const content = useList('content')
  const save = useSave('content')
  const edit = useEditor()
  const [dragId, setDragId] = useState<number | null>(null)
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="flex gap-3">
        {contentStatuses.map((s) => {
          const col = content.filter((c) => (c.status || 'idea') === s.value).sort((a, b) => (a.publish_date || '9').localeCompare(b.publish_date || '9'))
          return (
            <div
              key={s.value}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragId) {
                  const patch: { id: number; status: ContentStatus; publish_date?: string } = { id: dragId, status: s.value as ContentStatus }
                  const item = content.find((c) => c.id === dragId)
                  if (s.value === 'published' && !item?.publish_date) patch.publish_date = todayStr()
                  save.mutate(patch)
                }
                setDragId(null)
              }}
              className="flex w-60 shrink-0 flex-col rounded-[10px] border border-line bg-surface-2/50"
            >
              <div className="flex items-center justify-between px-3 py-2.5">
                <Badge tone={s.tone}>{s.label}</Badge>
                <span className="text-[12.5px] text-fg-3">{col.length}</span>
              </div>
              <div className="flex min-h-24 flex-col gap-2 px-2 pb-2">
                {col.map((c) => (
                  <div
                    key={c.id}
                    draggable
                    onDragStart={() => setDragId(c.id)}
                    onDragEnd={() => setDragId(null)}
                    onClick={() => edit('content', c)}
                    className={clsx(
                      'cursor-pointer rounded-[9px] border border-line bg-surface p-3 shadow-[0_1px_2px_rgb(0_0_0/0.04)] hover:shadow-md',
                      dragId === c.id && 'opacity-50',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 text-[13.5px] font-medium">{c.title}</div>
                      <StatusPicker
                        value={c.status || 'idea'}
                        options={contentStatuses}
                        label="Этап"
                        compact
                        onChange={(v) =>
                          save.mutate({ id: c.id, status: v as ContentStatus, ...(v === 'published' && !c.publish_date ? { publish_date: todayStr() } : {}) })
                        }
                      />
                    </div>
                    {c.idea && <div className="mt-1 line-clamp-2 text-[12.5px] text-fg-3">{c.idea}</div>}
                    <div className="mt-2 flex items-center gap-2 text-[12px] text-fg-3">
                      {c.platform && (
                        <span className="flex items-center gap-1">
                          <Clapperboard size={11} />
                          {c.platform}
                        </span>
                      )}
                      {c.publish_date && <span>{relDate(c.publish_date)}</span>}
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => edit('content', { status: s.value })}
                  className="flex h-7 items-center justify-center gap-1 rounded-[7px] text-[12.5px] text-fg-3 hover:bg-hover hover:text-fg"
                >
                  <Plus size={12} /> Добавить
                </button>
              </div>
            </div>
          )
        })}
      </div>
      <p className="mt-2 text-[12.5px] text-fg-3">
        Перетаскивайте карточки между этапами. При переносе в «Опубликовано» дата публикации ставится автоматически. Всего единиц: {num(content.length)}
      </p>
    </div>
  )
}
