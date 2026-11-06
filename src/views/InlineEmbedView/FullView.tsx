import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react'
import * as Primitive from '@radix-ui/react-dialog'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, X } from 'lucide-react'

import { Button } from '@/components/atoms/Button'
import { usePublishedNode } from '@/hooks/use-published-node'
import { deepActiveElement } from '@/lib/active-element'
import { setFrame, widgetOverlayContainer } from '@/lib/overlay'

/**
 * PROTOTYPE (`ux/embed-inline`): the whole interface over the host's page, opened by a tap on the
 * inline card. It is `CompactEmbedView`'s dialog, changed in four ways:
 *
 *  - **Edge to edge on phones.** Below 640px wide, or under 500px tall (a phone turned sideways),
 *    it fills the screen (`100dvh`, safe-area padding) and slides up; otherwise it keeps today's
 *    24px margin with the page dimmed behind. The overlay's margin was chosen on purpose ("a
 *    full-bleed layer would read as a navigation"), so the phone half is a decision for Devindra.
 *    The bar below is what answers that worry instead.
 *  - **A bar with the host's name.** "shrimataji.org" on the left says the visitor is still on
 *    that site; "Close" on the right is the one way out that is always visible. The Atlas's own
 *    Back stays inside the panel, so the two never sit side by side.
 *  - **The page stays where it was.** `overflow: hidden` does not stop iOS scrolling the page
 *    under a layer, so the body is pinned at its scroll offset while open and put back after,
 *    which leaves the visitor at the same paragraph. Needs a real iPhone check.
 *  - **Focus lands where the tap meant.** On the panel heading, or, for the search field, the
 *    field the card's own input hands it to (see `FinderCard`).
 *
 * Radix still owns the focus trap, `aria-modal`, hiding the page from screen readers and Escape.
 * The history entry and the Fullscreen API live in `InlineEmbedView`, which owns `open`.
 */

const aboveHost = 'z-[2147483000]'
const overlayClass = `fixed inset-0 ${aboveHost} bg-black/50`
// Phone: the whole screen. `h-dvh` rather than `bottom-0` so iOS's collapsing toolbar can't leave
// a strip of page under the layer. From 640px wide AND 500px tall: today's overlay, 24px in. The
// height condition keeps a phone turned sideways (844x390) edge to edge: with the margin it was a
// 796x342 box with the page dimmed around it and Register below the fold.
const surfaceClass = `fixed inset-x-0 top-0 ${aboveHost} flex h-dvh flex-col overflow-clip bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-foreground outline-none sm:[@media(min-height:500px)]:inset-6 sm:[@media(min-height:500px)]:h-auto sm:[@media(min-height:500px)]:rounded-xl sm:[@media(min-height:500px)]:pt-0 sm:[@media(min-height:500px)]:pb-0 sm:[@media(min-height:500px)]:shadow-2xl`
// ⚠ `contain: layout` makes this the containing block for the interface's fixed layer (map,
// drawers, peek strips) — see `CompactEmbedView`'s dialog, which carries the measurement.
const frameClass = 'relative min-h-0 flex-1 overflow-clip [contain:layout]'

/** The 56px bar: where you are on the left, the way out on the right. */
function Bar({ start, end }: { start: ReactNode; end?: ReactNode }) {
  return (
    <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-divider bg-background ps-4 pe-2">
      <div className="min-w-0 flex-1 truncate">{start}</div>
      {end}
    </div>
  )
}

/** The interface's box: published as the frame so every drawer portals inside it. */
function Frame({ children }: { children: ReactNode }) {
  const { node, adopt } = usePublishedNode<HTMLDivElement>(setFrame)

  return (
    <div ref={adopt} className={frameClass} data-sy-frame="">
      {node && children}
    </div>
  )
}

/**
 * Pins the page at its scroll offset while `active`, and restores it after. Inside a frame this
 * pins the frame's own document, which is harmless.
 */
function usePinnedPage(active: boolean) {
  useEffect(() => {
    if (!active) return

    const y = window.scrollY
    const body = document.body.style
    const root = document.documentElement.style
    const saved = {
      position: body.position,
      top: body.top,
      left: body.left,
      right: body.right,
      width: body.width,
      overscroll: root.overscrollBehavior,
    }

    body.position = 'fixed'
    body.top = `-${y}px`
    body.left = '0'
    body.right = '0'
    body.width = '100%'
    root.overscrollBehavior = 'none'

    return () => {
      body.position = saved.position
      body.top = saved.top
      body.left = saved.left
      body.right = saved.right
      body.width = saved.width
      root.overscrollBehavior = saved.overscroll
      window.scrollTo(0, y)
    }
  }, [active])
}

/**
 * The browser's top layer, where the full view draws, when the browser has one (the Popover API).
 *
 * A host's own floating controls often sit at the very top of the z-index range (on the page this
 * was built against, a "Share page" tab stayed over the open class page). The top layer paints
 * above every z-index on the page, so nothing of the host's can cover the full view or its Close.
 * Where the Popover API is missing, the layer falls back to the z-index below.
 */
function useTopLayer(open: boolean, enabled: boolean) {
  const [state, setLayer] = useState<HTMLDivElement | null>(null)
  const layer = enabled ? state : null

  useLayoutEffect(() => {
    if (!layer || typeof layer.showPopover !== 'function') return
    if (open && !layer.matches(':popover-open')) layer.showPopover()
    if (!open && layer.matches(':popover-open')) layer.hidePopover()
  }, [layer, open])

  const supported = Boolean(layer && typeof layer.showPopover === 'function')

  return { layer: supported ? layer : null, adoptLayer: setLayer }
}

// The popover's own UA box (centred, bordered, fit-content) undone: it is only a container.
const topLayerClass =
  'fixed inset-0 m-0 h-full max-h-none w-full max-w-none overflow-visible border-0 bg-transparent p-0'

export type FullViewProps = {
  open: boolean
  /** Close as the visitor asked (Close, Escape, a click on the dimmed page). */
  onClose: () => void
  /** The host's site name for the bar, or `null` when it can't be known. */
  host: string | null
  /** Accessible name of the dialog. */
  title: string
  /** Where focus goes on open: the panel itself, or nowhere yet (the search field takes it). */
  focus: 'panel' | 'search'
  /**
   * Draw in the top layer. Off inside a frame: the host's page is outside the frame anyway, and in
   * the fullscreen path the fullscreen element enters the top layer after the popover and would
   * cover it.
   */
  topLayer: boolean
  children: ReactNode
}

export function FullView({ open, onClose, host, title, focus, topLayer, children }: FullViewProps) {
  const { t } = useTranslation()
  const panel = useRef<HTMLDivElement | null>(null)
  const opener = useRef<HTMLElement | null>(null)
  const { layer, adoptLayer } = useTopLayer(open, topLayer)

  usePinnedPage(open)

  return (
    <>
      {/* `popover` is spread because React 18's types predate it; the DOM takes it as-is. */}
      <div ref={adoptLayer} className={topLayerClass} {...{ popover: 'manual' }} />
      <Primitive.Root
        open={open}
        onOpenChange={(next) => {
          if (!next) onClose()
        }}
      >
        <Primitive.Portal container={layer ?? widgetOverlayContainer()}>
          <Primitive.Overlay className={overlayClass} />
          <Primitive.Content
            asChild
            aria-describedby={undefined}
            onCloseAutoFocus={(event) => {
              // Back to the card control that opened it, when it is still there. Not to the card's
              // search field on a touch screen: focusing it would raise the keyboard again.
              const back = opener.current

              if (!back?.isConnected) return
              event.preventDefault()
              if (back.hasAttribute('data-sy-handover') && matchMedia('(pointer: coarse)').matches)
                return
              back.focus({ preventScroll: true })
            }}
            onOpenAutoFocus={(event) => {
              event.preventDefault()
              // Through shadow roots: in the script embed the page only sees our host element.
              const active = deepActiveElement()

              opener.current = active instanceof HTMLElement ? active : null
              // For the search field, the card's own input keeps focus (and iOS's keyboard) until
              // the interface's field takes it over. Otherwise, the panel: announced by its name.
              if (focus === 'panel') panel.current?.focus({ preventScroll: true })
            }}
          >
            <motion.div
              ref={panel}
              animate={{ opacity: 1, y: 0 }}
              className={surfaceClass}
              initial={{ opacity: 0, y: 24 }}
              tabIndex={-1}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            >
              <Primitive.Title className="sr-only">{title}</Primitive.Title>
              <Bar
                end={
                  <Primitive.Close asChild>
                    <Button className="h-11 gap-1.5 px-3 text-base text-foreground" variant="ghost">
                      <X aria-hidden size={20} />
                      {t('common.chrome.close')}
                    </Button>
                  </Primitive.Close>
                }
                start={host && <span className="text-sm text-gray-11">{host}</span>}
              />
              <Frame>{children}</Frame>
            </motion.div>
          </Primitive.Content>
        </Primitive.Portal>
      </Primitive.Root>
    </>
  )
}

/**
 * The same shell as a page: what a visitor sees after a frame on iPhone sent them to the Atlas page
 * (`openPath` → `page`). No dialog, no Close; the bar leads back to the host instead.
 */
export function ReturnShell({
  host,
  onBack,
  children,
}: {
  host: string
  onBack: (() => void) | null
  children: ReactNode
}) {
  const { t } = useTranslation()

  return (
    <div className="fixed inset-x-0 top-0 flex h-dvh flex-col bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-foreground">
      <Bar
        start={
          onBack ? (
            <Button
              className="-ms-3 h-11 max-w-full gap-1 px-2 text-base text-foreground"
              variant="ghost"
              onClick={onBack}
            >
              <ChevronLeft aria-hidden className="shrink-0 rtl:-scale-x-100" size={20} />
              <span className="truncate">{t('common.chrome.back_to', { title: host })}</span>
            </Button>
          ) : (
            <span className="text-sm text-gray-11">{host}</span>
          )
        }
      />
      <Frame>{children}</Frame>
    </div>
  )
}
