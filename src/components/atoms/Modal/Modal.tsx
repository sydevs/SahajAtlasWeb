import { type ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'

import { Button } from '@/components/atoms/Button'
import { overlayContainer } from '@/lib/overlay'

// A centred, ephemeral dialog on @radix-ui/react-dialog (issue #79). Radix
// owns the focus trap, Esc, and scroll lock. This atom owns the Tailwind
// skin, which reuses the Drawer atom's tokens, so the two surfaces read as
// one system. It portals into the themed widget root through
// `overlayContainer()`, so an embedded modal inherits the brand variables
// and the light/dark class. SettingsMenu and the Select listbox make the
// same call.
//
// This is deliberately NOT part of the URL-driven drawer stack
// (`src/views/`). A modal is ephemeral local state. It never appears in the
// URL, and opening or closing it must not push or pop history. Reach for
// the Drawer for anything that IS a navigable place.
//
// This sits above the drawer, which is z-40, at z-50. So it overlays the
// stack, instead of being swallowed by it.
//
// **Both axes are measured against the box this modal is CLIPPED to, not
// the viewport.** It portals through `overlayContainer()`. So inside a
// frame, such as `CompactEmbedView`'s dialog or a contained map's
// `MapFrame` (#169), `contain: layout` makes that frame the containing
// block. A viewport unit would then describe something else entirely.
//
// Height reads `--sy-frame-h`, which is `100dvh` outside a frame and `100%`
// inside one. Width is `100%`, which needs no token. A percentage on a
// fixed element already resolves against its containing block. So it
// describes the viewport where there is no frame, and the frame where there
// is one.
//
// ⚠ It used to be `100vw`, defended on the reasoning that "`max-w-md` caps
// it well below `100vw-2rem` on any viewport where the difference could
// show". That was true while the only frame was a near-viewport dialog. A
// `MapFrame` can be 360px at the interface floor, and `max-w-md` is 448.
const overlay = 'fixed inset-0 z-50 bg-black/50'
const content =
  'fixed left-1/2 top-1/2 z-50 flex max-h-[calc(var(--sy-frame-h,100dvh)-2rem)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-divider bg-background text-foreground shadow-2xl outline-none'
const header = 'flex shrink-0 items-start gap-2 px-4 pb-2 pt-4'

export type ModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
}

/** The modal root. Compose `ModalContent` (+ Body/Footer) inside. */
export function Modal({ open, onOpenChange, children }: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      {children}
    </Dialog.Root>
  )
}

export type ModalContentProps = {
  /** The visible heading. It is also the dialog's accessible name (one Radix Title). */
  title: ReactNode
  /** Optional supporting line under the title (the Radix Description). */
  description?: ReactNode
  /** Accessible label for the × control. Atoms take their copy as props, not from i18n. */
  closeLabel: string
  /**
   * Radix's focus-return target is whatever had focus when the dialog
   * mounted. That is not always the control that opened it, since a menu
   * item is gone by then. Handle this event to send focus somewhere
   * specific: call `preventDefault()`, then `.focus()` your own element.
   */
  onCloseAutoFocus?: (event: Event) => void
  children: ReactNode
  className?: string
}

/** The portaled, centred panel: header (title, description, ×) above `children`. */
export function ModalContent({
  title,
  description,
  closeLabel,
  onCloseAutoFocus,
  children,
  className,
}: ModalContentProps) {
  // Radix logs a missing-description warning unless `aria-describedby` is
  // explicitly undefined. But passing that prop unconditionally would ALSO
  // clobber the id it wires up when a Description renders. So this opts out
  // only when there is no description.
  const describedBy = description ? {} : { 'aria-describedby': undefined }

  return (
    <Dialog.Portal container={overlayContainer()}>
      <Dialog.Overlay className={overlay} />
      <Dialog.Content
        className={`${content} ${className ?? ''}`}
        onCloseAutoFocus={onCloseAutoFocus}
        {...describedBy}
      >
        <div className={header}>
          <div className="min-w-0 flex-1">
            <Dialog.Title className="text-base font-semibold">{title}</Dialog.Title>
            {description && (
              <Dialog.Description className="mt-1 text-sm text-gray-11">
                {description}
              </Dialog.Description>
            )}
          </div>
          <Dialog.Close asChild>
            <Button isIconOnly aria-label={closeLabel} size="sm" variant="ghost">
              <X size={20} />
            </Button>
          </Dialog.Close>
        </div>
        {children}
      </Dialog.Content>
    </Dialog.Portal>
  )
}

export function ModalBody({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={`min-h-0 flex-1 overflow-y-auto px-4 py-2 ${className ?? ''}`}>{children}</div>
  )
}

export function ModalFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`mt-auto flex shrink-0 justify-end gap-2 border-t border-gray-4 px-4 py-3 ${className ?? ''}`}
    >
      {children}
    </div>
  )
}

/** Wraps a control so activating it closes the modal (Radix `Close`). */
export function ModalClose({ children }: { children: ReactNode }) {
  return <Dialog.Close asChild>{children}</Dialog.Close>
}
