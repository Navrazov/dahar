import { useRef, useState, type ReactNode } from 'react'
import { Trash2 } from 'lucide-react'

/** A short left swipe reveals the action; a full swipe commits it. Vertical gestures remain native scrolling. */
export function SwipeDelete({ children, onDelete, disabled = false, label }: { children: ReactNode; onDelete: () => void; disabled?: boolean; label: string }) {
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const gesture = useRef<{ x: number; y: number; offset: number; horizontal: boolean } | null>(null),
    suppressUntil = useRef(0)
  return (
    <div className="relative overflow-hidden bg-bad" data-testid="swipe-row">
      <button
        type="button"
        aria-label={`Удалить ${label}`}
        tabIndex={offset < 0 ? 0 : -1}
        aria-hidden={offset === 0}
        disabled={disabled || offset === 0}
        onClick={onDelete}
        className="absolute inset-y-0 right-0 flex w-22 flex-col items-center justify-center gap-1 bg-bad text-xs font-medium text-white"
      >
        <Trash2 size={19} />
        Удалить
      </button>
      <div
        className="relative bg-surface touch-pan-y"
        style={{ transform: `translateX(${offset}px)`, transition: dragging ? 'none' : 'transform 180ms ease' }}
        onPointerDown={(e) => {
          if (disabled || e.button !== 0) return
          suppressUntil.current = 0
          gesture.current = { x: e.clientX, y: e.clientY, offset, horizontal: false }
        }}
        onPointerMove={(e) => {
          const g = gesture.current
          if (!g || disabled) return
          const dx = e.clientX - g.x,
            dy = e.clientY - g.y
          if (!g.horizontal) {
            if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) {
              gesture.current = null
              return
            }
            if (Math.abs(dx) < 10 || Math.abs(dx) <= Math.abs(dy) * 1.4) return
            g.horizontal = true
            setDragging(true)
            e.currentTarget.setPointerCapture(e.pointerId)
          }
          e.preventDefault()
          suppressUntil.current = performance.now() + 500
          setOffset(Math.max(-e.currentTarget.clientWidth, Math.min(0, g.offset + dx)))
        }}
        onPointerUp={(e) => {
          const g = gesture.current
          gesture.current = null
          setDragging(false)
          if (!g?.horizontal) return
          const distance = g.offset + e.clientX - g.x
          suppressUntil.current = performance.now() + 500
          if (distance < -Math.max(180, e.currentTarget.clientWidth * 0.55)) {
            setOffset(-88)
            onDelete()
          } else setOffset(distance < -40 ? -88 : 0)
        }}
        onPointerCancel={() => {
          setDragging(false)
          setOffset(gesture.current?.offset ?? 0)
          gesture.current = null
        }}
        onClickCapture={(e) => {
          if (performance.now() < suppressUntil.current) {
            e.preventDefault()
            e.stopPropagation()
            suppressUntil.current = 0
          }
        }}
      >
        {children}
      </div>
    </div>
  )
}
