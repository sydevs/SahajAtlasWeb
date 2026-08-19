import { type ReactNode, useCallback, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { motion } from 'framer-motion'

import { Button } from '@/components/atoms/Button'
import { CloseIcon } from '@/components/atoms/Icons'
import { setExpandedSurface, widgetOverlayContainer } from '@/lib/overlay'

/**
 * **Expansion is not a new layout — it is map mode's layout made explicit and reversible.**
 *
 * A `fixed; inset: 0` layer is exactly what map mode already paints, which is why vaul's
 * window-height arithmetic becomes *correct* here rather than broken: the widget genuinely
 * does span the window, so the snap-point translate a bottom sheet computes off
 * `window.innerHeight` is the right number. Nothing has to be taught to vaul, no drawer needs
 * a contained variant, and "not in the box" stops being an accident of map mode and becomes a
 * state with an entry and an exit (issue #161).
 *
 * **Deliberately not the `Modal` atom.** That one is `max-w-md` with a title/description/×
 * header — a panel with chrome, centred in the viewport. This is the whole viewport with no
 * chrome at all, because what goes inside it is an interface that draws its own.
 *
 * Radix supplies everything a hand-rolled `fixed inset-0` div would have to reinvent: the
 * focus trap, focus restore to the control that opened it, Esc, `aria-modal`, and — through
 * `Dialog.Overlay`, which is where `react-remove-scroll` actually lives — the host page's
 * scroll lock, which `docs/embedding.md` documents as an honest exception.
 *
 * **Every portal in the app is redirected inside it while it is open** (`setExpandedSurface`).
 * That is not tidiness: a modal dialog traps focus in its own content and hides everything
 * else from assistive technology, so a drawer portaled beside it would be unreachable by
 * keyboard. See `lib/overlay.ts`.
 */
export type ExpandedSurfaceProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * The dialog's accessible name. Rendered `sr-only` — the surface carries no visible
   * heading, but a dialog without a name is announced as an unlabelled group.
   */
  title: string
  /** Accessible label for the collapse control; atoms take their copy as props. */
  collapseLabel: string
  children: ReactNode
}

// The surface is opaque and covers the viewport, so the overlay behind it is never seen.
// It is rendered anyway because it is the element Radix hangs `react-remove-scroll` off —
// without it the host page scrolls behind an expanded widget.
const overlay = 'fixed inset-0 z-50'
const surface = 'fixed inset-0 z-50 bg-background text-foreground outline-none'
// Deliberately the SettingsMenu cog's chrome, down to the shadow: they are the two floating
// controls over the same surface, at opposite corners, and they should read as one system.
const collapse =
  'absolute end-3 top-3 z-50 border-divider bg-background text-gray-11 shadow-lg hover:text-foreground'

export function ExpandedSurface({
  open,
  onOpenChange,
  title,
  collapseLabel,
  children,
}: ExpandedSurfaceProps) {
  // The surface node, held in STATE rather than a ref, and the children wait for it.
  //
  // `overlayContainer()` is read in render bodies all over the app, so the surface has to be
  // published before its children first render — a ref alone would be one commit late and the
  // first drawer would portal itself outside the dialog. A callback ref publishes during the
  // layout phase and the resulting re-render is flushed before paint, so there is no frame in
  // which the two disagree. Stable identity, or every render would release and re-adopt.
  const [node, setNode] = useState<HTMLDivElement | null>(null)
  const adopt = useCallback((element: HTMLDivElement | null) => {
    setExpandedSurface(element)
    setNode(element)
  }, [])

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      {/* NOT `overlayContainer()`: that would resolve to this surface once it is open, and a
          portal cannot render into its own subtree. */}
      <Dialog.Portal container={widgetOverlayContainer()}>
        <Dialog.Overlay className={overlay} />
        {/* Radix warns unless the missing description is opted out of by name. */}
        <Dialog.Content asChild aria-describedby={undefined}>
          <motion.div
            ref={adopt}
            animate={{ opacity: 1 }}
            className={surface}
            data-sy-expanded=""
            initial={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <Dialog.Title className="sr-only">{title}</Dialog.Title>
            {/* Entry only, and the exit is instant on purpose: animating the way out needs
                `forceMount`, which keeps the expanded interface — the Mapbox canvas included —
                mounted while collapsed, and not mounting it is the entire point of the compact
                form. framer rather than CSS so `MotionConfig` covers it, which is what keeps
                reduced motion to three seams instead of four (`.claude/rules/components.md`). */}
            {node && children}
            {/* The only chrome, and it has to exist: the interface inside covers the viewport,
                so Esc is the sole other way out and a touch visitor has no Esc. `absolute`
                inside a `fixed inset-0` parent is viewport-positioned; `end-3` is logical, so
                it follows `dir`. The map's own control column is nudged clear of it in
                `globals.css`, keyed on the attribute above. */}
            <Dialog.Close asChild>
              <Button
                isIconOnly
                aria-label={collapseLabel}
                className={collapse}
                radius="full"
                size="sm"
                variant="bordered"
              >
                <CloseIcon size={16} />
              </Button>
            </Dialog.Close>
          </motion.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
