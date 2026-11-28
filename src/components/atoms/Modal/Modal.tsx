import { type ReactNode, createContext, useContext } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'

import { Button } from '@/components/atoms/Button'
import { TOUCH_ONLY_QUERY } from '@/config/responsive'
import { useOpenerRestore } from '@/hooks/use-opener-restore'
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
// frame, such as the inline embed's expanded dialog (#161, #169), `contain: layout` makes
// that frame the containing block. A viewport unit would then describe something else entirely.
//
// Height reads `--sy-frame-h`, which is `100dvh` outside a frame and `100%`
// inside one. Width is `100%`, which needs no token. A percentage on a
// fixed element already resolves against its containing block. So it
// describes the viewport where there is no frame, and the frame where there
// is one.
//
// ⚠ It used to be `100vw`, defended on the reasoning that "`max-w-md` caps
// it well below `100vw-2rem` on any viewport where the difference could
// show". That was true only while every frame was near the viewport's size, and a
// frame's size is not ours to promise.
const overlay = 'fixed inset-0 z-50 bg-black/50'
const content =
  'fixed left-1/2 top-1/2 z-50 flex max-h-[calc(var(--sy-frame-h,100dvh)-32px)] w-[calc(100%-32px)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-divider bg-background text-foreground shadow-2xl outline-none'
const header = 'flex shrink-0 items-start gap-2 px-4 pb-2 pt-4'

export type ModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
}

/**
 * What the root records for the content to use, since the content unmounts while the dialog is
 * closed and the recorder has to run exactly then. Module-private: a caller that wants focus
 * somewhere else takes `onCloseAutoFocus` instead.
 */
const OpenerContext = createContext<ReturnType<typeof useOpenerRestore<HTMLDivElement>> | null>(
  null,
)

/** The modal root. Compose `ModalContent` (+ Body/Footer) inside. */
export function Modal({ open, onOpenChange, children }: ModalProps) {
  // The root is the only part of this atom that knows whether the dialog is open, and the
  // recorder has to run while it is closed — `use-opener-restore.ts` owns why.
  const restore = useOpenerRestore<HTMLDivElement>(open)

  return (
    <OpenerContext.Provider value={restore}>
      <Dialog.Root open={open} onOpenChange={onOpenChange}>
        {children}
      </Dialog.Root>
    </OpenerContext.Provider>
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
   * ⚠ **Radix restores focus to a `Dialog.Trigger`, and this atom renders none** — it is
   * controlled through `open`. With no trigger, Radix's own handler calls `preventDefault()`
   * and focuses nothing, so closing dropped the viewer on `<body>` and a keyboard viewer
   * started again from the top of the host's page (measured, #432). The atom records the
   * opener itself instead, and restores to it.
   *
   * Handle this event to send focus somewhere else — a menu item that opened the dialog is
   * gone by the time it closes, for instance. Call `preventDefault()`, then `.focus()` your
   * own element; the atom's own restore stands down when you do.
   */
  onCloseAutoFocus?: (event: Event) => void
  children: ReactNode
  className?: string
}

/**
 * Radix starts a dialog on its first tabbable control, which here is always the header's ×, so
 * the dialog read as though Close were already chosen. A form starts in its first field instead,
 * and anything else on the dialog itself. On a touch-only screen the dialog takes focus either
 * way: a focused field there raises the keyboard over the form before the viewer has read it.
 *
 * A form that suspends (the report form behind its spinner) has no field yet at open, so the
 * dialog watches for one and hands focus on, unless the viewer has moved it meanwhile.
 */
const startInFirstField = (event: Event) => {
  const dialog = event.target

  if (!(dialog instanceof HTMLElement)) return
  event.preventDefault()
  dialog.focus({ preventScroll: true })
  if (window.matchMedia?.(TOUCH_ONLY_QUERY).matches) return

  const root = dialog.getRootNode() as Document | ShadowRoot
  const handOn = () => {
    // A control a viewer fills in. A Radix `Select` trigger is a `combobox` button.
    const field = [
      ...dialog.querySelectorAll<HTMLElement>(
        ':is(input:not([type="hidden"]), textarea, [role="combobox"]):not(:disabled)',
      ),
    ].find((candidate) => candidate.checkVisibility?.() ?? true)

    if (field) field.focus({ preventScroll: true })

    return field !== undefined
  }

  if (handOn()) return
  const watch = new MutationObserver(() => {
    if (root.activeElement !== dialog || handOn()) watch.disconnect()
  })

  watch.observe(dialog, { childList: true, subtree: true })
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

  const restore = useContext(OpenerContext)

  const onClose = (event: Event) => {
    onCloseAutoFocus?.(event)

    // The caller took it. Theirs wins, and calling ours after would move focus twice.
    if (event.defaultPrevented) return

    restore?.restoreFocus(event)
  }

  return (
    <Dialog.Portal container={overlayContainer()}>
      <Dialog.Overlay className={overlay} />
      <Dialog.Content
        ref={restore?.adoptContent}
        className={`${content} ${className ?? ''}`}
        onCloseAutoFocus={onClose}
        onOpenAutoFocus={startInFirstField}
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
