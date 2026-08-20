import type { CompactState } from '@/lib/compact-state'

import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import * as Primitive from '@radix-ui/react-dialog'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/atoms/Button'
import { CloseIcon } from '@/components/atoms/Icons'
import { LocalExpansionProvider, NoExpansionProvider, useExpansion } from '@/hooks/use-expansion'
import { setDialog, widgetOverlayContainer } from '@/lib/overlay'
import { useReportModal } from '@/config/store'

/**
 * What the widget IS in a slot too small for the interface (issue #161): a card with one
 * control, and — where there is room to grow in place — the dialog that control opens.
 *
 * **A view rather than a component, because it is a whole screen.** It is the alternative to
 * `DrawerStack`, chosen by `decideSlot` at mount, not a piece something else composes.
 *
 * **The dialog lives here rather than in `atoms/`, and that is the rule rather than a
 * preference.** It was briefly an `ExpandedSurface`/`Dialog` atom, which put two components
 * called Modal and Dialog side by side in the same folder doing what looked like the same job —
 * and the one that looked generic was not: it publishes itself as the app's portal target, it
 * needs `contain: layout` because *this* app's interface is fixed-positioned throughout, and it
 * has exactly one caller. `.claude/rules/components.md` covers both halves of that: atoms stay
 * primitive and carry no domain logic, and single-use compositions are inlined in their one
 * parent. `Modal` is now unambiguously the dialog atom — small, centred, chrome-ful, generic.
 */

// ===== THE CARD ===== //

type CardAction = { kind: 'overlay'; onOpen: () => void } | { kind: 'link'; href: string }

/**
 * The card itself.
 *
 * **The button is the card.** An earlier draft previewed two or three upcoming classes above it,
 * sized by a predicate that estimated a row's height in pixels. That estimate was wrong the
 * moment a title wrapped, a locale ran long, or a visitor had a larger default font — and the
 * rows cost a feed read, a titles read and a third-party IP lookup on every page view of a
 * sidebar embed nobody scrolls to. Without them **it makes no data requests at all**, which is
 * the honest shape for a screen whose whole job is to lead somewhere else.
 *
 * **It never fills its slot.** It takes the height its content needs and no more, in the host's
 * own flow, whatever box they gave. Filling is wrong in both directions: against an element with
 * no height `h-full` resolves to nothing and the card collapses to invisible, and against a tall
 * one it stretches two lines down 600px of empty background.
 *
 * **The button is named for the task, not the product** — "Find a class near you", never the
 * widget's own name. That is the accessible name a screen-reader user hears, and it is also the
 * de-branding ratchet (#158): the one control here is the easiest place in the app to forget it.
 */
function Card({ action }: { action: CardAction }) {
  const { t } = useTranslation('common')

  return (
    <div className="flex w-full flex-col items-center gap-2 overflow-hidden bg-background p-3 text-foreground">
      {/* Capped rather than full-bleed: a button stretched across a 1000px-wide slot reads as a
          broken layout rather than a card. */}
      <div className="flex w-full max-w-xs flex-col gap-2">
        {/* The same key the widget's landmark uses, deliberately: two keys for one phrase,
            differing only in casing, is a drift waiting to happen across ten locales. */}
        <h2 className="text-sm font-semibold">{t('widget.label')}</h2>
        {/* Two JSX branches, not a conditional `href`: `ButtonProps` is a discriminated union,
            so a maybe-undefined href does not narrow into the anchor arm. The anchor form is
            also why this is the `Button` atom rather than a hand-rolled <a> — `href.test.ts`
            pins the app's JSX-anchor inventory to three components, and Button is one of them,
            so its `isSafeHref` gate is inherited rather than reimplemented. */}
        {action.kind === 'link' ? (
          <Button color="primary" href={action.href} target="_blank">
            {t('compact.open')}
          </Button>
        ) : (
          <Button color="primary" onClick={action.onOpen}>
            {t('compact.open')}
          </Button>
        )}
      </div>
    </div>
  )
}

// ===== THE DIALOG IT OPENS ===== //

const overlayClass = 'fixed inset-0 z-50 bg-black/40'
// `contain: layout` via the arbitrary variant — see `ExpandedDialog`'s note. The inset is the
// margin that lets the host's page show through; rounded + shadow so the frame reads as
// deliberate.
const contentClass =
  'fixed inset-2 z-50 overflow-hidden rounded-xl bg-background text-foreground shadow-2xl outline-none [contain:layout] sm:inset-4'
// Deliberately the SettingsMenu cog's chrome, down to the shadow: they are the two floating
// controls over the same surface, at opposite corners, and they should read as one system.
const closeClass =
  'absolute end-3 top-3 z-50 border-divider bg-background text-gray-11 shadow-lg hover:text-foreground'

/**
 * The widget's own interface, over the host's page rather than in it.
 *
 * **It keeps a margin, and the margin is the point.** A full-bleed `inset: 0` layer reads as a
 * navigation — the host's page simply gone — and leaves a visitor no way to judge they are still
 * on it. A visible frame of the page behind, plus click-outside-to-close, makes it legibly a
 * layer over their site.
 *
 * ⚠ **`contain: layout` is load-bearing, not an optimisation.** Everything rendered inside — the
 * map canvas, every drawer, the peek strips, the cog — is `position: fixed`, and a fixed
 * descendant resolves against the VIEWPORT unless an ancestor establishes a containing block.
 * Without it they escape the margin and paint to the screen edge while the dialog sits inset.
 * Measured in Chrome 151: a `fixed; inset: 0` child of a `fixed; inset: 16px` parent lands at
 * 0,0,1440,900 plain and at 16,16,1408,868 under `contain: layout`.
 *
 * ⚠ That is the exact property `.claude/rules/components.md` forbids on the SCOPE ROOT, for the
 * same mechanism pointed the other way: there it would re-parent the fixed layer to the host's
 * element and break map mode. Here re-parenting is what we want. Do not move it up the tree.
 *
 * **Radix owns the behaviour**: focus trap, `aria-modal`, Escape, the host page's scroll lock
 * (via `Primitive.Overlay`, where `react-remove-scroll` lives, which `docs/embedding.md`
 * documents as an honest exception) and — now that there is an outside — dismissal by pointer.
 * An earlier version watched its own box with a `ResizeObserver` and closed itself when it
 * stopped covering the viewport, because the × was then the only exit and a host could hide it.
 * Click-outside and Escape are two exits Radix maintains for free, so that is gone.
 *
 * **Escape reaches the topmost layer, which may not be this one.** A vaul drawer inside is a
 * Radix dialog too, so its dismissable layer sits above and takes the key first — correctly.
 * `DrawerStack`'s `onEscapeKeyDown` finishes the ladder once the stack has nowhere left to go.
 *
 * **Every portal in the app is redirected inside it while it is open** (`setDialog`). Not
 * tidiness: a modal traps focus in its own content and hides everything else from assistive
 * technology, so a drawer portaled beside it would be unreachable by keyboard.
 */
function ExpandedDialog({
  open,
  onOpenChange,
  title,
  closeLabel,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  closeLabel: string
  children: ReactNode
}) {
  // The content node, held in STATE rather than a ref, and the children wait for it.
  //
  // `overlayContainer()` is read in render bodies all over the app, so this has to be published
  // before its children first render — a ref alone would be one commit late and the first drawer
  // would portal itself outside the dialog. A callback ref publishes during the layout phase and
  // the resulting re-render is flushed before paint. Stable identity, or every render would
  // release and re-adopt.
  const [node, setNode] = useState<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const adopt = useCallback((element: HTMLDivElement | null) => {
    contentRef.current = element
    setDialog(element)
    setNode(element)
  }, [])

  // Who to give focus back to on close.
  //
  // **Radix's own restore targets `Primitive.Trigger`, and there is deliberately none here**:
  // opening is requested through the `useExpansion` seam, from a control that may be anywhere.
  // With no trigger Radix focuses nothing, so a keyboard viewer who closes is dropped on
  // `<body>` — the top of the HOST's page, not the control they pressed.
  //
  // Tracked while CLOSED, because by the time an effect could run on open Radix has already
  // moved focus inside — child effects run before the parent's.
  //
  // **Scoped to the widget's own root, and that is a correctness fix rather than hygiene.**
  // Safari and Firefox on macOS do not focus a `<button>` on click, so pressing the opening
  // control fires no `focusin` at all — listening on `document` would leave this pointing at
  // whatever the HOST had focused earlier (a search box, a login field), and closing would focus
  // it, scrolling their page there and raising the keyboard on a phone.
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
        <Primitive.Overlay className={overlayClass} />
        {/* Radix warns unless the missing description is opted out of by name. */}
        <Primitive.Content
          asChild
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            event.preventDefault()

            const root = widgetOverlayContainer()

            // Re-checked against the root rather than trusted: `isConnected` alone would still
            // be true for a host element, and the recorder is not the only thing that could have
            // written here.
            if (opener.current?.isConnected && root?.contains(opener.current)) {
              opener.current.focus()
            }
          }}
          // Focus the container, not the first control inside it. Radix's default sends focus to
          // the first tabbable — here whatever chrome the interface renders first, announced with
          // no word about what just opened.
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            contentRef.current?.focus()
          }}
        >
          {/* Entry only, and the exit is instant on purpose: animating the way out needs
              `forceMount`, which keeps the content — the Mapbox canvas included — mounted while
              closed, and not mounting it is the entire point of the compact form. framer rather
              than CSS so `MotionConfig` covers it, which keeps reduced motion to three seams
              instead of four (`.claude/rules/components.md`). */}
          <motion.div
            ref={adopt}
            animate={{ opacity: 1 }}
            className={contentClass}
            data-sy-expanded=""
            initial={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <Primitive.Title className="sr-only">{title}</Primitive.Title>
            {/* Held back until the ref above has published this node, so the first drawer portals
                inside the dialog rather than beside it. */}
            {node && children}
            {/* The pointer's exit. No longer the only one — Escape reaches us through
                `DrawerStack`, and the margin behind is clickable — but the visible one. */}
            <Primitive.Close asChild>
              <Button
                isIconOnly
                aria-label={closeLabel}
                className={closeClass}
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

// ===== THE VIEW ===== //

export type CompactEmbedViewProps = {
  /** The decision `decideSlot` reached: where the button goes, and whether to open on mount. */
  compact: CompactState
  /**
   * The full interface, rendered only once the dialog opens.
   *
   * Passed as `children` rather than constructed here so React never renders it while collapsed
   * — which is what keeps mapbox-gl unfetched behind a compact embed, and makes that claim true
   * rather than aspirational.
   */
  children: ReactNode
}

export function CompactEmbedView({ compact, children }: CompactEmbedViewProps) {
  // A `link` card has nothing to open: the button is an anchor to a page that fits, because a
  // framed embed cannot grow where it is. No provider state, no dialog — and `NoExpansionProvider`
  // is what keeps `collapse()` an honest no-op for the Escape ladder in `DrawerStack`.
  if (compact.action.kind === 'link') {
    return (
      <NoExpansionProvider>
        <Card action={compact.action} />
      </NoExpansionProvider>
    )
  }

  return (
    <LocalExpansionProvider autoOpen={compact.autoOpen}>
      <Expandable>{children}</Expandable>
    </LocalExpansionProvider>
  )
}

/** Inside the provider, so it can read the seam the provider supplies. */
function Expandable({ children }: { children: ReactNode }) {
  const { t } = useTranslation('common')
  const { expanded, expand, collapse } = useExpansion()

  return (
    <>
      <Card action={{ kind: 'overlay', onOpen: expand }} />
      <ExpandedDialog
        closeLabel={t('close')}
        open={expanded}
        // The same name the widget's own landmark carries, for the same reason: a dialog whose
        // accessible name resolves empty is announced as an unlabelled group.
        title={t('widget.label')}
        onOpenChange={(next) => {
          if (next) return

          // `ReportIssueModal` is mounted OUTSIDE this branch (it has to outlive the app
          // boundary so the error fallbacks can reach it) but portals through
          // `overlayContainer()`, which is this dialog while it is open. Closing with the modal
          // up would leave it rendering into a detached node with its own scroll lock still on
          // the host page.
          useReportModal.getState().closeReport()
          collapse()
        }}
      >
        {children}
      </ExpandedDialog>
    </>
  )
}
