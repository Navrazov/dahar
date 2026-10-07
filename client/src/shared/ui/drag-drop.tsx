import { Children, createContext, useCallback, useContext, useEffect, useId, useRef, useState, type HTMLAttributes, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { GripVertical } from 'lucide-react'
import clsx from 'clsx'

export interface DragItem {
  type: string
  id: number
  title: string
}
export interface DropTarget {
  id: string
  label: string
  data: Record<string, string | null>
}
type Zone = { element: HTMLElement; target: DropTarget }
type Session = { item: DragItem; x: number; y: number; startX: number; startY: number; started: boolean; keyboard: boolean; over: string | null }
interface Context {
  scope: string
  active: DragItem | null
  over: string | null
  disabled: boolean
  register: (zone: Zone) => () => void
  start: (item: DragItem, x: number, y: number, keyboard: boolean) => void
}
const DragContext = createContext<Context | null>(null)

/** Pointer handles keep ordinary page scrolling and text selection available on touch screens. */
export function DragDropProvider({
  children,
  onDrop,
  disabled = false,
}: {
  children: ReactNode
  onDrop: (item: DragItem, target: DropTarget) => void
  disabled?: boolean
}) {
  const scope = useId(),
    zones = useRef(new Map<string, Zone>()),
    session = useRef<Session | null>(null)
  const [active, setActive] = useState<DragItem | null>(null),
    [over, setOver] = useState<string | null>(null),
    [point, setPoint] = useState({ x: 0, y: 0 }),
    [announcement, setAnnouncement] = useState('')
  const register = useCallback((zone: Zone) => {
    zones.current.set(zone.target.id, zone)
    return () => {
      if (zones.current.get(zone.target.id) === zone) zones.current.delete(zone.target.id)
    }
  }, [])
  const start = (item: DragItem, x: number, y: number, keyboard: boolean) => {
    if (disabled || session.current) return
    session.current = { item, x, y, startX: x, startY: y, started: keyboard, keyboard, over: null }
    if (keyboard) {
      setActive(item)
      setPoint({ x, y })
      setAnnouncement(`Перенос ${item.title}. Стрелками выберите место, Enter — перенести, Escape — отменить.`)
    }
  }
  useEffect(() => {
    const targetAt = (x: number, y: number) => {
      const hit = document.elementFromPoint(x, y)?.closest('[data-drop-id]')
      const key = hit?.getAttribute('data-drop-id')
      return key?.startsWith(scope + ':') ? zones.current.get(key.slice(scope.length + 1)) : undefined
    }
    const updateTarget = (zone?: Zone) => {
      const s = session.current
      if (!s || s.over === (zone?.target.id ?? null)) return
      s.over = zone?.target.id ?? null
      setOver(s.over)
      setAnnouncement(zone ? `Место: ${zone.target.label}` : 'Выберите место для переноса')
    }
    const clear = () => {
      session.current = null
      setActive(null)
      setOver(null)
    }
    const finish = (cancel = false) => {
      const s = session.current,
        zone = s?.over ? zones.current.get(s.over) : undefined
      clear()
      if (!cancel && !disabled && s?.started && zone) {
        setAnnouncement(`Перенесено: ${zone.target.label}`)
        onDrop(s.item, zone.target)
      } else if (s?.started) setAnnouncement('Перенос отменён')
    }
    const move = (e: PointerEvent) => {
      const s = session.current
      if (!s || s.keyboard) return
      s.x = e.clientX
      s.y = e.clientY
      if (!s.started && Math.hypot(s.x - s.startX, s.y - s.startY) < 7) return
      if (!s.started) {
        s.started = true
        setActive(s.item)
        frame = requestAnimationFrame(scroll)
      }
      e.preventDefault()
      setPoint({ x: s.x, y: s.y })
      updateTarget(targetAt(s.x, s.y))
    }
    const up = (e: PointerEvent) => {
      if (session.current && !session.current.keyboard) {
        updateTarget(targetAt(e.clientX, e.clientY))
        finish()
      }
    }
    const cancel = () => finish(true)
    const key = (e: KeyboardEvent) => {
      const s = session.current
      if (!s) return
      if (e.key === 'Escape') {
        e.preventDefault()
        finish(true)
        return
      }
      if (!s.keyboard) return
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        finish()
        return
      }
      if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return
      e.preventDefault()
      const choices = [...zones.current.values()]
        .filter((z) => {
          const r = z.element.getBoundingClientRect()
          return r.width > 0 && r.height > 0
        })
        .sort((a, b) => {
          const x = a.element.getBoundingClientRect(),
            y = b.element.getBoundingClientRect()
          return x.top - y.top || x.left - y.left
        })
      if (!choices.length) return
      const index = choices.findIndex((z) => z.target.id === s.over),
        direction = e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 1
      const zone = choices[(index + direction + choices.length) % choices.length]
      zone.element.scrollIntoView({ block: 'nearest' })
      updateTarget(zone)
      const rect = zone.element.getBoundingClientRect()
      setPoint({ x: rect.left, y: rect.top })
    }
    let frame = 0
    const scroll = () => {
      const s = session.current
      if (s?.started && !s.keyboard) {
        let element = document.elementFromPoint(s.x, s.y) as HTMLElement | null
        while (element && element !== document.body) {
          if (/auto|scroll/.test(getComputedStyle(element).overflowY) && element.scrollHeight > element.clientHeight) {
            const rect = element.getBoundingClientRect()
            if (s.y < rect.top + 32) element.scrollBy(0, -12)
            else if (s.y > rect.bottom - 32) element.scrollBy(0, 12)
            break
          }
          element = element.parentElement
        }
        if (!element || element === document.body) {
          if (s.y < 48) window.scrollBy(0, -12)
          else if (s.y > innerHeight - 48) window.scrollBy(0, 12)
        }
        updateTarget(targetAt(s.x, s.y))
      }
      if (session.current?.started && !session.current.keyboard) frame = requestAnimationFrame(scroll)
    }
    window.addEventListener('pointermove', move, { passive: false })
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('keydown', key)
    window.addEventListener('blur', cancel)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('keydown', key)
      window.removeEventListener('blur', cancel)
    }
  }, [onDrop, disabled, scope])
  return (
    <DragContext.Provider value={{ scope, active, over, disabled, register, start }}>
      {children}
      <span className="sr-only" aria-live="polite">
        {announcement}
      </span>
      {active &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[100] max-w-64 rounded-xl border border-accent bg-surface px-4 py-3 text-sm font-medium shadow-xl"
            style={{ left: Math.min(point.x + 12, innerWidth - 200), top: Math.min(point.y + 12, innerHeight - 64) }}
          >
            {active.title}
          </div>,
          document.body,
        )}
    </DragContext.Provider>
  )
}

export function DragHandle({ item, className }: { item: DragItem; className?: string }) {
  const context = useContext(DragContext)
  if (!context) return null
  return (
    <button
      type="button"
      aria-label={`Перетащить ${item.title}`}
      aria-pressed={context.active?.type === item.type && context.active.id === item.id}
      disabled={context.disabled}
      onClick={(e) => {
        e.stopPropagation()
        e.preventDefault()
      }}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.stopPropagation()
        e.currentTarget.setPointerCapture(e.pointerId)
        context.start(item, e.clientX, e.clientY, false)
      }}
      onKeyDown={(e) => {
        if ((e.key === ' ' || e.key === 'Enter') && !context.active) {
          e.preventDefault()
          e.stopPropagation()
          const r = e.currentTarget.getBoundingClientRect()
          context.start(item, r.left, r.top, true)
        }
      }}
      className={clsx(
        'flex min-h-9 w-8 shrink-0 touch-none cursor-grab items-center justify-center rounded-md text-fg-3 hover:bg-hover active:cursor-grabbing disabled:opacity-30',
        className,
      )}
    >
      <GripVertical size={16} />
    </button>
  )
}
export function DropZone({ target, children, className, ...props }: HTMLAttributes<HTMLDivElement> & { target: DropTarget }) {
  const context = useContext(DragContext),
    element = useRef<HTMLDivElement>(null)
  const register = context?.register
  useEffect(() => {
    if (register && element.current) return register({ element: element.current, target })
  }, [register, target])
  return (
    <div
      {...props}
      ref={element}
      data-drop-id={context ? `${context.scope}:${target.id}` : undefined}
      data-drop-label={target.label}
      className={clsx(className, context?.active && context.over === target.id && 'bg-accent/10 ring-2 ring-accent ring-inset')}
    >
      {children}
    </div>
  )
}

export function DragShelf({ children, className }: { children: ReactNode; className?: string }) {
  const context = useContext(DragContext)
  if (!Children.count(children)) return null
  return createPortal(
    <div
      aria-label="Места для переноса"
      className={clsx(
        'fixed inset-x-3 bottom-6 z-40 mx-auto max-h-56 max-w-2xl flex-wrap gap-2 overflow-y-auto rounded-xl border border-accent/30 bg-surface p-3 shadow-xl',
        context?.active ? 'flex' : 'hidden',
        className,
      )}
    >
      {children}
    </div>,
    document.body,
  )
}
