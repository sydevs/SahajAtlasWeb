import { Suspense, lazy, useEffect } from 'react'
import { useSuspenseQuery } from '@tanstack/react-query'

import { DrawerBody, DrawerFooter } from '@/components/atoms/Drawer'
import { EventMetadata } from '@/components/molecules'
// Leaf-file imports (not the folder index): the index re-exports EventDetails,
// and importing it statically here would pull the lazy-loaded panel chunk
// (DOMPurify + action wiring) back into the main bundle.
import { EventHeader } from '@/components/organisms/EventDetails/EventHeader'
import {
  EventRegisterBar,
  hasRegisterSlot,
} from '@/components/organisms/EventDetails/EventRegister'
import { Spinner } from '@/components/atoms/Spinner'
import { useEventDisplay } from '@/hooks/use-event-display'
import { eventQuery } from '@/config/api'
import { useIsDesktop } from '@/config/responsive'
import { useLocale } from '@/hooks/use-locale'
import { useMapController } from '@/hooks/use-map-controller'
import { useWidgetMode } from '@/config/mode'
import { CloseButton, useDrawerControl, useFrameOnTop } from '@/views/shared'

// EventDetails pulls in DOMPurify + the action-row wiring; keep it out of the
// main chunk (as pages/event.tsx used to) by lazy-loading it here.
const EventDetails = lazy(() =>
  import('@/components/organisms/EventDetails').then((m) => ({ default: m.EventDetails })),
)

// A single event (route `<event-path>`). The header (title + chips + timing) is
// the mobile sheet's 80px peek payload and stays pinned above the scrolling
// body. On the mobile map sheet, Register lives in a sticky bottom bar pinned
// to the viewport edge (via the live `--sy-sheet-top` mirror) so scrolling the
// description can never hide the KPI (issue #52, WS4); elsewhere it renders
// inline in the panel order.
export function EventView({ id, basePath }: { id: number; basePath: string }) {
  const { standalone, hasMap } = useWidgetMode()
  const { frameEvent, clearSelection } = useMapController()
  const { locale } = useLocale()
  const isDesktop = useIsDesktop()
  const { collapsed } = useDrawerControl()

  const { data: event } = useSuspenseQuery(eventQuery(id, locale))

  useFrameOnTop(({ isEntry }) => frameEvent(event, { isEntry }), [event, frameEvent])

  useEffect(() => () => clearSelection(), [clearSelection])

  // The snap-ladder bottom sheet is the one surface where in-flow content can
  // scroll the CTA away — pin Register there; keep it inline everywhere else.
  // Never pin an empty bar (inactive events render no register slot at all).
  const { display } = useEventDisplay(event)
  const stickyRegister = hasMap && !isDesktop && hasRegisterSlot(event, display)

  return (
    <>
      {/* SEO (title, canonical, JSON-LD) is only meaningful for the crawlable
          standalone build; the embedded widget's host owns the document head. */}
      {standalone && <EventMetadata event={event} />}
      <EventHeader event={event} trailing={<CloseButton />} />
      <DrawerBody>
        <Suspense fallback={<Spinner className="mx-auto my-16" />}>
          <EventDetails basePath={basePath} event={event} registerInline={!stickyRegister} />
          {/* Keep the last content clear of the pinned register bar. */}
          {stickyRegister && <div aria-hidden className="h-24" />}
        </Suspense>
      </DrawerBody>
      {stickyRegister && (
        <DrawerFooter
          sticky
          className={`px-4 py-3 transition-transform ${collapsed ? 'translate-y-full opacity-0' : ''}`}
        >
          <EventRegisterBar basePath={basePath} event={event} />
        </DrawerFooter>
      )}
    </>
  )
}
