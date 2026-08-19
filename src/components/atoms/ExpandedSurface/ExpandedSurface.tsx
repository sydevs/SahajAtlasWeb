import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
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
 * Radix supplies most of what a hand-rolled `fixed inset-0` div would have to reinvent: the
 * focus trap, `aria-modal`, and — through `Dialog.Overlay`, which is where
 * `react-remove-scroll` actually lives — the host page's scroll lock, which
 * `docs/embedding.md` documents as an honest exception. Focus restore is ours (see `opener`
 * below), and so, in practice, is the way out.
 *
 * **Escape does not reach this dialog, and that is correct rather than broken.** The drawer
 * stack inside it is vaul, which is Radix Dialog underneath, so its dismissable layer sits
 * ABOVE this one and Radix delivers the key to the topmost layer only — Escape dismisses the
 * drawer the viewer is actually looking at, which is what they mean by it. Verified in a
 * browser, including at the stack's root where nothing is left to dismiss and the key does
 * nothing at all. That is exactly why the collapse control below is not optional.
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
  // The same node as `node`, in a ref: the focus handlers below are read at event time, and
  // the closure Radix captured at mount still sees the state as null.
  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const adopt = useCallback((element: HTMLDivElement | null) => {
    surfaceRef.current = element
    setExpandedSurface(element)
    setNode(element)
  }, [])

  // Who to give focus back to on collapse.
  //
  // **Radix's own restore targets `Dialog.Trigger`, and there is deliberately no trigger
  // here**: expansion is requested through the seam (`useExpansion`), from a control that
  // may be anywhere — the card's button today, a row press, a frame message later. With no
  // trigger Radix prevents the default restore and focuses nothing, so a keyboard viewer who
  // collapses the widget is dropped on `<body>` — back at the top of the HOST's page, not on
  // the control they pressed. Verified in a browser; this is the same record-and-restore
  // `useReportModal` keeps beside its store, for the same reason.
  //
  // Tracked while CLOSED rather than read at open time, because by the time an effect here
  // could run, Radix has already moved focus into the dialog — child effects run before the
  // parent's.
  const opener = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (open) return

    const remember = () => {
      const active = document.activeElement as HTMLElement | null

      // Never remember something inside ourselves. React runs this effect's cleanup and the
      // dialog's own focus move in the same commit, and the order is the library's to choose
      // — measured, the surface's mount focus lands here first, and remembering it means
      // restoring focus to a node that is gone by the time anyone asks.
      if (active && surfaceRef.current?.contains(active)) return

      opener.current = active
    }

    remember()
    document.addEventListener('focusin', remember)

    return () => document.removeEventListener('focusin', remember)
  }, [open])

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      {/* NOT `overlayContainer()`: that would resolve to this surface once it is open, and a
          portal cannot render into its own subtree. */}
      <Dialog.Portal container={widgetOverlayContainer()}>
        <Dialog.Overlay className={overlay} />
        {/* Radix warns unless the missing description is opted out of by name. */}
        <Dialog.Content
          asChild
          aria-describedby={undefined}
          // Give focus back to the control that asked for the expansion. `preventDefault`
          // first: Radix composes its own handler after this one and skips it only when the
          // default is prevented. Guarded on `isConnected` — the opener may have been
          // re-rendered away while the widget was expanded.
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            if (opener.current?.isConnected) opener.current.focus()
          }}
          // Focus the surface itself, not the first control inside it. Radix's default sends
          // focus to the first tabbable, which here is whatever chrome the interface happens
          // to render first — the settings cog — announced with no word about what just
          // opened. Focusing the container announces the dialog and its name, and Tab then
          // walks the interface from the top.
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            surfaceRef.current?.focus()
          }}
        >
          {/* Entry only, and the exit is instant on purpose: animating the way out needs
              `forceMount`, which keeps the expanded interface — the Mapbox canvas included —
              mounted while collapsed, and not mounting it is the entire point of the compact
              form. framer rather than CSS so `MotionConfig` covers it, which is what keeps
              reduced motion to three seams instead of four (`.claude/rules/components.md`). */}
          <motion.div
            ref={adopt}
            animate={{ opacity: 1 }}
            className={surface}
            data-sy-expanded=""
            initial={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <Dialog.Title className="sr-only">{title}</Dialog.Title>
            {/* Held back until the ref above has published this node, so the first drawer
                portals inside the dialog rather than beside it. */}
            {node && children}
            {/* The only chrome, and it is the ONLY way out — see the Escape note above.
                `absolute`
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
