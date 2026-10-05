import type { ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="admin-overlay fixed inset-0 z-50 bg-black/35" />
        <Dialog.Content
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            const el = e.currentTarget as HTMLElement
            const first = window.matchMedia('(min-width:640px)').matches ? el.querySelector<HTMLElement>('input,textarea') : null
            ;(first || el).focus({ preventScroll: true })
          }}
          className="admin-modal fixed top-[8dvh] left-1/2 z-50 flex max-h-[84dvh] w-[calc(100%-32px)] max-w-[440px] -translate-x-1/2 flex-col overflow-hidden rounded-[12px] border border-line bg-surface text-fg shadow-2xl outline-none"
        >
          <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-3.5">
            <Dialog.Title className="text-[16px] font-semibold tracking-[-0.015em]">{title}</Dialog.Title>
            <Dialog.Description className="sr-only">{typeof title === 'string' ? title : 'Диалог'}</Dialog.Description>
            <Dialog.Close
              aria-label="Закрыть"
              className="-mr-1.5 flex h-7 w-7 items-center justify-center rounded-[6px] text-fg-3 hover:bg-hover hover:text-fg"
            >
              <X size={16} />
            </Dialog.Close>
          </div>
          <div className="min-h-0 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
