import type { MouseEvent } from 'react'
import type { EventSlim } from '@/types'

import { useTranslation } from 'react-i18next'

import { Button } from '@/components/atoms/Button'
import { EventsList } from '@/components/organisms/EventsList/EventsList'

/**
 * What the widget shows in a slot too small for the interface (issue #161): a heading, a
 * couple of classes, and one control that opens the whole thing.
 *
 * **The button is named for the task, not the product** — "Find a class near you", never the
 * widget's own name. That is the accessible name a screen-reader user hears, and it is also
 * the de-branding ratchet (#158): the atlas has to read as the host's own events feature, and
 * the one control on this card is the easiest place in the app to forget that.
 *
 * **The button is the card's irreducible content.** Everything above it — the heading, the
 * preview rows — is what the host's box had room for, decided once at mount by `compactFit`
 * (`lib/embed-slot.ts`). A box too short for a single row still gets the button, centred; it
 * is never traded away for a preview.
 *
 * Presentational: the rows arrive as props, so a story can render it without the query client
 * or the IP lookup, and the node lane can assert its markup. Its container is
 * `DynamicCompactCard`.
 */
export type CompactCardProps = {
  /** The classes to preview. Empty is fine — the button is the card. */
  events: EventSlim[]
  /**
   * Does the host's box have a height to fill?
   *
   * `false` — a bare `<sahaj-atlas>` with no height, which is the common way one lands in a
   * narrow column — means the card takes its CONTENT height. `h-full` there resolves against
   * nothing, so the card would collapse and the host would see an embed that "did not render".
   * The theme root above is `display: contents`, so this div is the layout box in the host's
   * own flow and content-height sizing needs nothing from the element or the loader.
   */
  fill: boolean
  /** Open the full interface. */
  onOpen: () => void
}

export function CompactCard({ events, fill, onOpen }: CompactCardProps) {
  const { t } = useTranslation('common')

  // A row is a real route, and in the compact form there is nothing to render it: the drawer
  // stack only exists inside the expanded surface. So a row press has to expand FIRST and let
  // the navigation land inside — captured before react-router's own handler so both are one
  // React update and the surface opens already on the event's route.
  //
  // Plain left clicks only. A modified click is the browser being asked for a new tab, and
  // covering this page with an overlay is not what that asked for.
  const openRow = (event: MouseEvent<HTMLDivElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    if (!(event.target instanceof Element) || !event.target.closest('a')) return

    onOpen()
  }

  return (
    // Centred on both axes, in whatever box the host gave. With a height that is a real
    // centring; without one the column is content-height and only the horizontal half does
    // anything — which is why `justify-center` costs nothing in the `fill: false` case rather
    // than needing a branch of its own.
    <div
      className={`flex w-full flex-col items-center justify-center gap-2 overflow-hidden bg-background p-3 text-foreground ${
        fill ? 'h-full' : ''
      }`}
    >
      {/* `max-w-xs` because a short-but-wide slot is a compact slot too: a full-bleed button
          across 1000px reads as a broken layout, where a centred column reads as a card. */}
      <div className="flex min-h-0 w-full max-w-xs flex-1 flex-col justify-center gap-2">
        {/* The same key the widget's landmark uses, deliberately: two keys for one phrase,
            differing only in casing, is a drift waiting to happen across ten locales. */}
        <h2 className="shrink-0 text-center text-sm font-semibold">{t('widget.label')}</h2>
        {events.length > 0 && (
          // Scrolls rather than clips: the row budget is an estimate off the host's box, so a
          // row that turns out taller than estimated stays reachable instead of being cut in
          // half. The scrolling itself belongs to the `List` atom, which is already
          // `overflow-y-auto` — this only gives it a height to scroll within, so there is one
          // owner of the behaviour rather than two.
          <div className="flex min-h-0 flex-1 flex-col" onClickCapture={openRow}>
            <EventsList events={events} />
          </div>
        )}
        <Button className="w-full shrink-0" color="primary" onClick={onOpen}>
          {t('compact.open')}
        </Button>
      </div>
    </div>
  )
}
