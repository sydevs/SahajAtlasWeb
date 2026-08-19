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
 * Presentational: the rows arrive as props, so a story can render it without the query client
 * or the IP lookup, and the node lane can assert its markup. Its container is
 * `DynamicCompactCard`.
 */
export type CompactCardProps = {
  /** The classes to preview. An empty list is fine — the card is still a way in. */
  events: EventSlim[]
  /** Open the full interface. */
  onOpen: () => void
}

export function CompactCard({ events, onOpen }: CompactCardProps) {
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
    <div className="flex h-full w-full flex-col gap-2 overflow-hidden bg-background p-3 text-foreground">
      <h2 className="shrink-0 text-sm font-semibold">{t('free_meditation_classes')}</h2>
      {events.length > 0 && (
        // Not a control, so it needs no keyboard handler of its own: everything focusable
        // inside is an anchor, and this only rides along with the click those anchors
        // already handle — including the one Enter produces.
        <div className="min-h-0 flex-1 overflow-hidden" onClickCapture={openRow}>
          <EventsList events={events} />
        </div>
      )}
      <Button className="w-full shrink-0" color="primary" onClick={onOpen}>
        {t('compact.open')}
      </Button>
    </div>
  )
}
