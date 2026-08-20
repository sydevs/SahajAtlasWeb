import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
// Aliased: our own export is `Dialog`, so the primitive namespace cannot also be.
import * as Primitive from '@radix-ui/react-dialog'
import { motion } from 'framer-motion'

import { Button } from '@/components/atoms/Button'
import { CloseIcon } from '@/components/atoms/Icons'
import { setDialog, widgetOverlayContainer } from '@/lib/overlay'

/**
 * A large, chrome-less dialog: the widget's own interface, over the page rather than in it.
 *
 * **Where this sits next to `Modal`.** `Modal` is the small one — `max-w-md`, with a
 * title/description/× header — for a message or a form. This one is nearly the whole viewport
 * and draws no chrome beyond its close control, because what goes inside draws its own. Both
 * are `@radix-ui/react-dialog`; the difference is size and whether the content is a panel or an
 * application.
 *
 * **It keeps a margin, and the margin is the point.** A full-bleed `inset: 0` layer reads as a
 * navigation — the host's page is simply gone — and leaves a visitor no way to judge that they
 * are still on it. A visible frame of the page behind, plus click-outside-to-close, makes this
 * legibly a layer over their site rather than a departure from it.
 *
 * ⚠ **`contain: layout` on the content is load-bearing, not an optimisation.** Everything the
 * widget renders inside — the map canvas, every drawer, the peek strips, the settings cog — is
 * `position: fixed`, and a fixed descendant resolves against the VIEWPORT unless an ancestor
 * establishes a containing block. Without it they escape the margin and paint to the screen
 * edge while the dialog sits inset, which looks like a broken dialog rather than a contained
 * interface. Measured in Chrome 151: a `fixed; inset: 0` child of a `fixed; inset: 16px` parent
 * lands at 0,0,1440,900 plain; at 16,16,1408,868 under `contain: layout` (and under a
 * transform, which would do the same job and cost a compositor layer).
 *
 * ⚠ That is the exact property `.claude/rules/components.md` forbids on the SCOPE ROOT, for the
 * same mechanism pointed the other way: there it would re-parent the fixed layer to the host's
 * element and break map mode. Here re-parenting is what we want. Do not move it up the tree.
 *
 * **Radix owns the behaviour, deliberately**: the focus trap, `aria-modal`, Escape, the host
 * page's scroll lock (via `Primitive.Overlay`, which is where `react-remove-scroll` lives, and
 * which `docs/embedding.md` documents as an honest exception), and — now that there is an
 * outside to click — dismissal by pointer. An earlier version of this component watched its own
 * box with a `ResizeObserver` and closed itself when it stopped covering the viewport, because
 * the × was then the only exit and a host could hide it. Click-outside and Escape are two exits
 * Radix maintains for free, so that machinery is gone.
 *
 * **Escape reaches the topmost layer, which may not be this one.** A vaul drawer inside is a
 * Radix dialog too, so its dismissable layer sits above this one and takes the key first —
 * correctly, since dismissing the drawer you are looking at is what Escape should do. The
 * ladder is finished in `DrawerStack`'s `onEscapeKeyDown`, which collapses the expansion once
 * the stack has nowhere left to go.
 *
 * **Every portal in the app is redirected inside it while it is open** (`setDialog`).
 * Not tidiness: a modal dialog traps focus in its own content and hides everything else from
 * assistive technology, so a drawer portaled beside it would be unreachable by keyboard.
 */
export type DialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * The dialog's accessible name. Rendered `sr-only` — this dialog carries no visible heading,
   * and a dialog without a name is announced as an unlabelled group.
   */
  title: string
  /** Accessible label for the close control; atoms take their copy as props. */
  closeLabel: string
  children: ReactNode
}

const overlay = 'fixed inset-0 z-50 bg-black/40'
// `contain: layout` via the arbitrary variant — see the docblock. The inset is the margin that
// lets the host's page show through; rounded + shadow so the frame reads as deliberate.
const content =
  'fixed inset-2 z-50 overflow-hidden rounded-xl bg-background text-foreground shadow-2xl outline-none [contain:layout] sm:inset-4'
// Deliberately the SettingsMenu cog's chrome, down to the shadow: they are the two floating
// controls over the same surface, at opposite corners, and they should read as one system.
const close =
  'absolute end-3 top-3 z-50 border-divider bg-background text-gray-11 shadow-lg hover:text-foreground'

export function Dialog({ open, onOpenChange, title, closeLabel, children }: DialogProps) {
  // The content node, held in STATE rather than a ref, and the children wait for it.
  //
  // `overlayContainer()` is read in render bodies all over the app, so this has to be published
  // before its children first render — a ref alone would be one commit late and the first
  // drawer would portal itself outside the dialog. A callback ref publishes during the layout
  // phase and the resulting re-render is flushed before paint. Stable identity, or every render
  // would release and re-adopt.
  const [node, setNode] = useState<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const adopt = useCallback((element: HTMLDivElement | null) => {
    contentRef.current = element
    setDialog(element)
    setNode(element)
  }, [])

  // Who to give focus back to on close.
  //
  // **Radix's own restore targets `Primitive.Trigger`, and there is deliberately no trigger here**:
  // opening is requested through the `useExpansion` seam, from a control that may be anywhere.
  // With no trigger Radix focuses nothing, so a keyboard viewer who closes is dropped on
  // `<body>` — the top of the HOST's page, not the control they pressed.
  //
  // Tracked while CLOSED, because by the time an effect here could run on open, Radix has
  // already moved focus inside — child effects run before the parent's.
  //
  // **Scoped to the widget's own root, and that is a correctness fix rather than hygiene.**
  // Safari and Firefox on macOS do not focus a `<button>` on click, so pressing the opening
  // control fires no `focusin` at all — listening on `document` would leave this pointing at
  // whatever the HOST had focused earlier (a search box, a login field), and closing would
  // focus it, scrolling their page there and raising the keyboard on a phone. Scoped, the worst
  // case is that we restore nothing, which is Radix's own default.
  const opener = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const root = widgetOverlayContainer()

    if (open || !root) return

    const remember = () => {
      const active = document.activeElement as HTMLElement | null

      // Never something inside the dialog itself: it is a descendant of this root, and the
      // dialog's mount focus can land before React has run this effect's cleanup.
      if (!active || !root.contains(active) || contentRef.current?.contains(active)) return

      opener.current = active
    }

    remember()
    root.addEventListener('focusin', remember)

    return () => root.removeEventListener('focusin', remember)
  }, [open])

  return (
    <Primitive.Root open={open} onOpenChange={onOpenChange}>
      {/* NOT `overlayContainer()`: that resolves to this dialog once it is open, and a portal
          cannot render into its own subtree. */}
      <Primitive.Portal container={widgetOverlayContainer()}>
        <Primitive.Overlay className={overlay} />
        {/* Radix warns unless the missing description is opted out of by name. */}
        <Primitive.Content
          asChild
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            event.preventDefault()

            const root = widgetOverlayContainer()

            // Re-checked against the root rather than trusted: `isConnected` alone would still
            // be true for a host element, and the recorder is not the only thing that could
            // have written here.
            if (opener.current?.isConnected && root?.contains(opener.current)) {
              opener.current.focus()
            }
          }}
          // Focus the container, not the first control inside it. Radix's default sends focus
          // to the first tabbable — here whatever chrome the interface renders first, announced
          // with no word about what just opened. Focusing the container announces the dialog and
          // its name, and Tab then walks the interface from the top.
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            contentRef.current?.focus()
          }}
        >
          {/* Entry only, and the exit is instant on purpose: animating the way out needs
              `forceMount`, which keeps the content — the Mapbox canvas included — mounted while
              closed, and not mounting it is the entire point of the compact card. framer rather
              than CSS so `MotionConfig` covers it, which is what keeps reduced motion to three
              seams instead of four (`.claude/rules/components.md`). */}
          <motion.div
            ref={adopt}
            animate={{ opacity: 1 }}
            className={content}
            data-sy-expanded=""
            initial={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <Primitive.Title className="sr-only">{title}</Primitive.Title>
            {/* Held back until the ref above has published this node, so the first drawer
                portals inside the dialog rather than beside it. */}
            {node && children}
            {/* The pointer's exit. No longer the only one — Escape reaches us through
                `DrawerStack`, and the overlay behind is clickable — but the visible one. */}
            <Primitive.Close asChild>
              <Button
                isIconOnly
                aria-label={closeLabel}
                className={close}
                radius="full"
                size="sm"
                variant="bordered"
              >
                <CloseIcon size={16} />
              </Button>
            </Primitive.Close>
          </motion.div>
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  )
}
