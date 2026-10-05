import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Command } from 'cmdk'
import { ArrowRight, FileText, Plus, Search, Settings } from 'lucide-react'
import { toast } from 'sonner'
import { api, type SearchHit } from '@/shared/api'
import { coreNav, quickAdd } from '@/shared/config'
import { relDate } from '@/shared/lib'
import { Spinner } from '@/shared/ui'
import { useModules } from '@/entities/module'
import { recordLabel, useEditor } from '@/features/edit-record'

type Item = { id: string; label: string; hint?: string; icon: typeof Plus; run: () => void }

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

const matches = (label: string, q: string) => !q || label.toLowerCase().includes(q.toLowerCase())

const itemCls =
  'flex h-9 cursor-pointer items-center gap-2.5 rounded-[7px] px-2.5 text-[14px] outline-none select-none data-[selected=true]:bg-hover [&_svg]:shrink-0 [&_svg]:text-fg-3'

const groupCls =
  '[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-[12px] [&_[cmdk-group-heading]]:text-fg-3'

/** Палитра команд: поиск по всем записям, быстрые действия и переходы. ⌘K / Ctrl+K или «/». */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate()
  const edit = useEditor()
  const modules = useModules()
  const [q, setQ] = useState('')
  const term = useDebounced(q.trim(), 200)
  const hits = useQuery({ queryKey: ['search', term], queryFn: () => api.search(term), enabled: open && term.length >= 2, staleTime: 10_000 })

  useEffect(() => {
    if (!open) setQ('')
  }, [open])

  const close = () => onOpenChange(false)
  const enabled = useMemo(() => new Set(modules.map((m) => m.key)), [modules])

  const actions: Item[] = quickAdd
    .filter((a) => !a.module || enabled.has(a.module))
    .map((a) => ({ id: `new:${a.table}`, label: `Добавить: ${a.label.toLowerCase()}`, icon: Plus, run: () => edit(a.table) }))

  const pages: Item[] = [
    ...coreNav.map((n) => ({ id: `go:${n.to}`, label: n.label, icon: n.icon, run: () => navigate(n.to) })),
    ...modules.map((m) => ({ id: `go:${m.to}`, label: m.label, icon: m.icon, run: () => navigate(m.to) })),
    { id: 'go:/settings', label: 'Настройки', icon: Settings, run: () => navigate('/settings') },
  ]

  const openHit = async (hit: SearchHit) => {
    if (hit.table === 'projects') return navigate(`/projects/${hit.id}`)
    try {
      edit(hit.table, await api.get(hit.table, hit.id))
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const select = (run: () => void) => {
    close()
    run()
  }

  const shownActions = actions.filter((a) => matches(a.label, q))
  const shownPages = pages.filter((p) => matches(p.label, q))
  const found = term.length >= 2 ? (hits.data ?? []) : []

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Поиск и команды"
      shouldFilter={false}
      loop
      overlayClassName="anim-overlay fixed inset-0 z-50 bg-black/35 backdrop-blur-[1px]"
      contentClassName="anim-modal fixed top-[12vh] left-1/2 z-50 w-[min(640px,calc(100vw-24px))] -translate-x-1/2 overflow-hidden rounded-[12px] border border-line bg-surface shadow-2xl"
    >
      <div className="flex items-center gap-2.5 border-b border-line px-3.5">
        <Search size={16} className="shrink-0 text-fg-3" />
        <Command.Input
          value={q}
          onValueChange={setQ}
          placeholder="Найти задачу, партнёра, операцию… или выполнить команду"
          className="h-12 w-full bg-transparent text-[15px] outline-none placeholder:text-fg-3"
        />
        {hits.isFetching && <Spinner />}
        <kbd className="rounded-[4px] border border-line px-1.5 text-[11px] text-fg-3">Esc</kbd>
      </div>
      <Command.List className="max-h-[min(60vh,440px)] overflow-y-auto overscroll-contain p-1.5">
        <Command.Empty className="px-3 py-8 text-center text-[13.5px] text-fg-3">
          {term.length >= 2 && hits.isFetching ? 'Ищем…' : 'Ничего не найдено'}
        </Command.Empty>

        {found.length > 0 && (
          <Command.Group heading="Записи" className={groupCls}>
            {found.map((h) => (
              <Command.Item key={`${h.table}:${h.id}`} value={`hit:${h.table}:${h.id}`} onSelect={() => select(() => openHit(h))} className={itemCls}>
                <FileText size={15} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{h.title || 'Без названия'}</span>
                  {h.snippet && <span className="block truncate text-[12px] text-fg-3">{h.snippet}</span>}
                </span>
                <span className="shrink-0 text-[12px] text-fg-3">
                  {recordLabel(h.table)}
                  {h.date && ` · ${relDate(h.date)}`}
                </span>
              </Command.Item>
            ))}
          </Command.Group>
        )}

        {shownActions.length > 0 && (
          <Command.Group heading="Действия" className={groupCls}>
            {shownActions.map((a) => (
              <Command.Item key={a.id} value={a.id} onSelect={() => select(a.run)} className={itemCls}>
                <a.icon size={15} />
                <span className="flex-1 truncate">{a.label}</span>
              </Command.Item>
            ))}
          </Command.Group>
        )}

        {shownPages.length > 0 && (
          <Command.Group heading="Перейти" className={groupCls}>
            {shownPages.map((p) => (
              <Command.Item key={p.id} value={p.id} onSelect={() => select(p.run)} className={itemCls}>
                <p.icon size={15} />
                <span className="flex-1 truncate">{p.label}</span>
                <ArrowRight size={13} />
              </Command.Item>
            ))}
          </Command.Group>
        )}
      </Command.List>
    </Command.Dialog>
  )
}

/** ⌘K / Ctrl+K — всегда, «/» — когда фокус не в поле ввода. */
export function useCommandPaletteHotkey(open: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        open()
        return
      }
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
      if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable], [role=dialog]')) return
      e.preventDefault()
      open()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
}
