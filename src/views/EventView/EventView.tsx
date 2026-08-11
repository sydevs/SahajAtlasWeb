import { Suspense, lazy, useEffect, useState } from 'react'
import { useSuspenseQuery } from '@tanstack/react-query'

import { DrawerBody, DrawerFooter } from '@/components/atoms/Drawer'
import { EventMetadata, ResetErrorBoundary } from '@/components/molecules'
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
import { useIsWideWidget } from '@/config/responsive'
import { useLocale } from '@/hooks/use-locale'
import { useMapController } from '@/hooks/use-map-controller'
import { useWidgetMode } from '@/config/mode'
import { CloseButton, useDrawerControl, useFrameOnTop } from '@/views/shared'
import { ErrorPanel } from '@/views/fallbacks'

// EventDetails pulls in DOMPurify + the action-row wiring; keep it out of the
// main chunk (as pages/event.tsx used to) by lazy-loading it here.
//
// Minted per attempt rather than once at module scope, because React caches a lazy
// component's REJECTED payload forever: after a failed chunk load, re-rendering the same
// `lazy` re-throws the stored rejection instantly, so the boundary's "Try again" would be
// the visibly-does-nothing button this work exists to remove (issue #89).
//
// It removes React's cache, not the browser's. The HTML module map also records a FAILED
// module fetch per URL, and browsers reject a later `import()` of the same specifier from
// that record without going to the network — so for a chunk that 404'd or was blocked by
// the host's CSP, the retry can still resolve to nothing. It does recover the case a
// remount can (a transient render throw inside the panel), which is why it's worth having;
// making the network case recover too needs a cache-busting specifier.
const loadEventDetails = () =>
  lazy(() =>
    import('@/components/organisms/EventDetails').then((m) => ({ default: m.EventDetails })),
  )

// A single event (route `<event-path>`). The header (the title) is the mobile
// sheet's 80px peek payload and stays pinned above the scrolling body; the chips
// and facts lead the body. On the mobile map sheet, Register lives in a sticky bar pinned
// to the viewport edge (via the live `--sy-sheet-top` mirror) so scrolling the
// description can never hide the KPI (issue #52, WS4); elsewhere it renders
// inline in the panel order.
export function EventView({ id, basePath }: { id: number; basePath: string }) {
  const { standalone, hasMap } = useWidgetMode()
  const { frameEvent, clearSelection } = useMapController()
  // `t` off `useLocale` rather than a second `useTranslation` — the hook already holds
  // one for the default (`common`) namespace and returns it to avoid the duplicate.
  const { t, locale } = useLocale()
  const isWide = useIsWideWidget()
  const { collapsed } = useDrawerControl()

  const { data: event } = useSuspenseQuery(eventQuery(id, locale))
  // The component itself is the state — the boundary's reset swaps in a fresh `lazy`. Held
  // directly rather than as a counter a memo keys off, so the rule ("a retry needs a new
  // lazy") is the code rather than something to reconstruct from a dep array. `useState`
  // calls a function initializer, and `lazy()` returns an object, so this reads once.
  const [EventDetails, setEventDetails] = useState(loadEventDetails)

  useFrameOnTop(({ isEntry }) => frameEvent(event, { isEntry }), [event, frameEvent])

  useEffect(() => () => clearSelection(), [clearSelection])

  // The snap-ladder bottom sheet is the one surface where in-flow content can
  // scroll the CTA away — pin Register there; keep it inline everywhere else.
  // Never pin an empty bar (inactive events render no register slot at all).
  //
  // Reads the WIDGET's width, not the screen's (issue #107): "is this a bottom sheet"
  // is the actual question, and DrawerStack answers it from the same measurement, so
  // the bar can never be pinned in a panel that has no snap ladder — or missing from a
  // sheet that does, which is what a narrow column embed on a desktop used to get.
  const { display } = useEventDisplay(event)
  const stickyRegister = hasMap && !isWide && hasRegisterSlot(event, display)

  return (
    <>
      {/* SEO (title, canonical, JSON-LD) is only meaningful for the crawlable
          standalone build; the embedded widget's host owns the document head. */}
      {standalone && <EventMetadata event={event} />}
      <EventHeader event={event} trailing={<CloseButton />} />
      {/* Clear the pinned register bar with the scroll container's own bottom
          padding — the Drawer's `sticky` footer asks for exactly that — rather than
          a spacer element in the flow. The old `h-24` div stacked on top of the
          content's own padding, leaving ~176px of blank space under a full-bleed
          carousel to clear a 65px bar. */}
      <DrawerBody className={stickyRegister ? 'pb-20' : undefined}>
        {/* The details are a lazy chunk, so they can fail on their own — a dropped
            connection mid-session, or a host CSP blocking the chunk — after the event
            itself resolved. Keeping that local means the title, the close button and the
            sticky Register CTA all survive: the event is still bookable even when its
            description isn't there (issue #89). */}
        <ResetErrorBoundary
          FallbackComponent={ErrorPanel}
          onReset={() => setEventDetails(loadEventDetails())}
        >
          {/* The one Spinner in the app with no visible label and no `decorative`, so
              it is the one whose screen-reader-only text actually renders. The atom
              defaults that text to English; this is a view, well past the i18n boot,
              so it can hand over the translated word (issue #102). */}
          <Suspense
            fallback={
              <Spinner
                className="mx-auto my-16"
                srLabel={t('loading', { defaultValue: 'Loading…' })}
              />
            }
          >
            <EventDetails basePath={basePath} event={event} registerInline={!stickyRegister} />
          </Suspense>
        </ResetErrorBoundary>
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
