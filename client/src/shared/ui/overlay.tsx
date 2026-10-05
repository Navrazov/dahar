import type { ReactNode, RefObject } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import * as Popover from '@radix-ui/react-popover'
import * as Menu from '@radix-ui/react-dropdown-menu'
import clsx from 'clsx'
import { X, type LucideIcon } from 'lucide-react'

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 560,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  width?: number
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="anim-overlay fixed inset-0 z-50 bg-black/35 backdrop-blur-[1px]" />
        <Dialog.Content
          onOpenAutoFocus={(e) => {
            const first = (e.currentTarget as HTMLElement).querySelector<HTMLElement>('[data-autofocus], input:not([type=hidden]), textarea')
            if (first) {
              e.preventDefault()
              first.focus()
            }
          }}
          className={clsx(
            'fixed z-50 flex flex-col overflow-hidden border border-line bg-surface text-fg shadow-2xl outline-none',
            'inset-x-0 bottom-0 max-h-[92dvh] rounded-t-2xl',
            'sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-[6vh] sm:max-h-[88vh] sm:w-[calc(100%-32px)] sm:-translate-x-1/2 sm:rounded-[12px]',
            'anim-modal',
          )}
          style={{ maxWidth: width }}
        >
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-5 py-3.5">
            <div className="min-w-0">
              <Dialog.Title className="text-[16px] font-semibold tracking-[-0.015em]">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-0.5 text-xs text-fg-3">{description}</Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">{typeof title === 'string' ? title : 'Диалог'}</Dialog.Description>
              )}
            </div>
            <Dialog.Close
              className="-mr-1.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-fg-3 transition-colors hover:bg-hover hover:text-fg"
              aria-label="Закрыть"
            >
              <X size={16} />
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
          {footer && (
            <div className="flex shrink-0 items-center justify-between gap-2 border-t border-line bg-surface px-5 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">
              {footer}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export function PopoverPanel({
  open,
  onOpenChange,
  trigger,
  anchor,
  children,
  align = 'start',
  matchWidth,
  className,
  keepFocus,
  ignoreRef,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  trigger?: ReactNode
  anchor?: ReactNode
  children: ReactNode
  align?: 'start' | 'center' | 'end'
  matchWidth?: boolean
  className?: string
  keepFocus?: boolean
  ignoreRef?: RefObject<HTMLElement | null>
}) {
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      {trigger && <Popover.Trigger asChild>{trigger}</Popover.Trigger>}
      {anchor && <Popover.Anchor asChild>{anchor}</Popover.Anchor>}
      <Popover.Portal>
        <Popover.Content
          ref={isolateScroll}
          align={align}
          sideOffset={6}
          collisionPadding={12}
          onOpenAutoFocus={keepFocus ? (e) => e.preventDefault() : undefined}
          onCloseAutoFocus={keepFocus ? (e) => e.preventDefault() : undefined}
          onInteractOutside={(e) => {
            if (ignoreRef?.current?.contains(e.target as Node)) e.preventDefault()
          }}
          className={clsx(
            'z-[70] max-h-[var(--radix-popover-content-available-height)] overflow-hidden rounded-[9px] border border-line bg-surface text-fg shadow-xl outline-none',
            'anim-pop',
            matchWidth && 'w-[var(--radix-popover-trigger-width)]',
            className,
          )}
        >
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

// Модалка блокирует прокрутку всего, что вне её DOM, а поповер рендерится порталом в body.
// Не даём колесу и тачу дойти до этого блокировщика, иначе списки внутри модалки не крутятся.
const stop = (e: Event) => e.stopPropagation()
function isolateScroll(el: HTMLDivElement | null) {
  if (!el) return
  el.addEventListener('wheel', stop)
  el.addEventListener('touchmove', stop)
  return () => {
    el.removeEventListener('wheel', stop)
    el.removeEventListener('touchmove', stop)
  }
}

export type MenuItem = { label: string; icon?: LucideIcon; onSelect: () => void; danger?: boolean } | 'separator'

export function DropdownMenu({
  trigger,
  items,
  align = 'start',
  className,
}: {
  trigger: ReactNode
  items: MenuItem[]
  align?: 'start' | 'end'
  className?: string
}) {
  return (
    <Menu.Root modal={false}>
      <Menu.Trigger asChild>{trigger}</Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align={align}
          sideOffset={6}
          collisionPadding={12}
          className={clsx('anim-pop z-[70] min-w-48 rounded-[9px] border border-line bg-surface p-1 text-fg shadow-xl outline-none', className)}
        >
          {items.map((it, i) =>
            it === 'separator' ? (
              <Menu.Separator key={i} className="my-1 h-px bg-line" />
            ) : (
              <Menu.Item
                key={it.label}
                onSelect={it.onSelect}
                className={clsx(
                  'flex h-8 cursor-pointer items-center gap-2 rounded-[6px] px-2.5 text-[13.5px] outline-none select-none transition-colors duration-100 data-[highlighted]:bg-hover',
                  it.danger && 'text-bad',
                )}
              >
                {it.icon && <it.icon size={14} className={it.danger ? '' : 'text-fg-3'} />}
                {it.label}
              </Menu.Item>
            ),
          )}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  )
}
