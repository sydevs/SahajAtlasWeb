import { Suspense, lazy, useState } from 'react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { Check } from 'lucide-react'

import { Alert } from '@/components/atoms/Alert'
import { DrawerBody, DrawerFooter } from '@/components/atoms/Drawer'
import { Link } from '@/components/atoms/Link'
import { EventMetadata, ResetErrorBoundary } from '@/components/molecules'
// This imports leaf files, not the folder index. The index re-exports EventDetails, and
// importing it statically here would pull the lazy-loaded panel chunk — DOMPurify and action
// wiring — back into the main bundle.
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
import { usePostEventFeedback } from '@/hooks/use-post-event-feedback'
import { useWidgetMode } from '@/config/mode'
import { parentOf } from '@/lib/shape'
import { CloseButton, useDrawerControl, useFrameOnTop } from '@/views/shared'
import { ErrorPanel } from '@/views/fallbacks'

// EventDetails pulls in DOMPurify and the action-row wiring. This keeps it out of the main
// chunk, as pages/event.tsx used to, by lazy-loading it here.
//
// This mints a new lazy component per attempt, not once at module scope. React caches a lazy
// component's REJECTED payload forever. After a failed chunk load, re-rendering the same
// `lazy` re-throws the stored rejection instantly, so the boundary's "Try again" would be the
// visibly-does-nothing button this work exists to remove (issue #89).
//
// This clears React's cache, not the browser's. The HTML module map also records a FAILED
// module fetch per URL, and browsers refuse a later `import()` of the same specifier from that
// record, without going to the network. So for a chunk that 404'd or was blocked by the host's
// CSP, the retry can still resolve to nothing. It does recover the case a remount can — a
// transient render throw inside the panel — which is why it is worth having. Making the
// network case recover too needs a cache-busting specifier.
const loadEventDetails = () =>
  lazy(() =>
    import('@/components/organisms/EventDetails').then((m) => ({ default: m.EventDetails })),
  )

// A single event, at route `<event-path>`. The header — the title — is the mobile sheet's
// 80px peek payload, and stays pinned above the scrolling body. The chips and facts lead the
// body. On the mobile map sheet, Register lives in a sticky bar pinned to the viewport edge,
// via the live `--sy-sheet-top` mirror, so scrolling the description can never hide the KPI
// (issue #52, WS4). Elsewhere it renders inline in the panel order.
export function EventView({ id, basePath }: { id: number; basePath: string }) {
  const { standalone, hasMap } = useWidgetMode()
  const { frameEvent } = useMapController()
  // `t` off `useLocale` rather than a second `useTranslation` — the hook already holds
  // one for the default (`common`) namespace and returns it to avoid the duplicate.
  const { t, locale } = useLocale()
  const isWide = useIsWideWidget()
  const { collapsed } = useDrawerControl()

  const { data: event } = useSuspenseQuery(eventQuery(id, locale))
  // A reader redirected here by the post-event email confirmed the class DID take place (#164).
  // Only `confirmed` lands on an event page — `denied` goes to the region — so a stray `denied`
  // renders nothing here, while the hook still takes the parameter out of the URL.
  const { answer: feedback, dismiss: dismissFeedback } = usePostEventFeedback()
  // The component itself is the state. The boundary's reset swaps in a fresh `lazy`. This
  // holds it directly, rather than as a counter a memo keys off, so the rule — "a retry needs
  // a new lazy" — is the code itself, not something to reconstruct from a dep array. `useState`
  // calls a function initializer, and `lazy()` returns an object, so this reads once.
  const [EventDetails, setEventDetails] = useState(loadEventDetails)

  useFrameOnTop(({ isEntry }) => frameEvent(event, { isEntry }), [event, frameEvent])

  // The snap-ladder bottom sheet is the one surface where in-flow content can scroll the CTA
  // away. Pin Register there. Keep it inline everywhere else. Never pin an empty bar —
  // inactive events render no register slot at all.
  //
  // This reads the WIDGET's width, not the screen's (issue #107), so it can never disagree
  // with the drawer it is pinned inside. "Is this a bottom sheet" is the actual question, and
  // DrawerStack answers it from the same measurement.
  //
  // **Agreement by construction — not a behaviour change.** This line computes exactly what it
  // did before #107, and keeps doing so while `hasMap` gates it. Map-less, the bar never
  // renders at all. In map mode there is no container, so the measured signal returns the
  // viewport's answer. The hook is here so a future map-less sticky bar starts out reading the
  // right thing, not because a narrow embed gains one today.
  const { display } = useEventDisplay(event)
  const stickyRegister = hasMap && !isWide && hasRegisterSlot(event, display)
  const onwardHref = parentOf(event.path)

  return (
    <>
      {/* SEO — title, canonical, JSON-LD — is only meaningful for the crawlable standalone
          build. The embedded widget's host owns the document head. */}
      {standalone && <EventMetadata event={event} />}
      <EventHeader event={event} trailing={<CloseButton />} />
      {/* Clear the pinned register bar with the scroll container's own bottom
          padding — the Drawer's `sticky` footer asks for exactly that — rather than
          a spacer element in the flow. The old `h-24` div stacked on top of the
          content's own padding, leaving ~176px of blank space under a full-bleed
          carousel to clear a 65px bar. */}
      <DrawerBody className={stickyRegister ? 'pb-20' : undefined}>
        {/* The details are a lazy chunk, so they can fail on their own — a dropped connection
            mid-session, or a host CSP blocking the chunk — after the event itself resolved.
            Keeping that local means the title, the close button, and the sticky Register CTA
            all survive. The event stays bookable even when its description is not there
            (issue #89). */}
        <ResetErrorBoundary
          FallbackComponent={ErrorPanel}
          onReset={() => setEventDetails(loadEventDetails())}
        >
          {/* The one Spinner in the app with no visible label and no `decorative`, so it is
              the one whose screen-reader-only text actually renders. The atom defaults that
              text to English. This is a view, well past the i18n boot, so it can hand over
              the translated word (issue #102). */}
          <Suspense
            fallback={
              <Spinner
                className="mx-auto my-16"
                srLabel={t('loading', { defaultValue: 'Loading…' })}
              />
            }
          >
            <EventDetails basePath={basePath} event={event} registerInline={!stickyRegister}>
              {/* This is passed as the panel's slot, so it lands immediately above Register,
                  which lives inside EventDetails when it is inline. The acknowledgement belongs
                  beside the action it wants the reader to take, and the panel is the only thing
                  that knows where that action sits.

                  The onward rung is the event's own region — "other classes near them" — built
                  from `event.path`, not `event.region.webPath`. That field is a CMS-supplied
                  route, and would need `safePath` before it could reach an href. `parentOf`
                  derives the same place from a route this view already resolved from. This
                  step is OPTIONAL. A path with no parent yields nothing, and the acknowledgement
                  then stands on its own, rather than rendering a link to nowhere. */}
              {feedback === 'confirmed' && (
                <Alert
                  closeLabel={t('close')}
                  color="primary"
                  description={
                    <>
                      {t('feedback.confirmed.body')}
                      {onwardHref && (
                        <Link className="mt-1 block underline" href={onwardHref}>
                          {t('feedback.nearby')}
                        </Link>
                      )}
                    </>
                  }
                  icon={<Check size={18} />}
                  role="status"
                  size="sm"
                  title={t('feedback.confirmed.title')}
                  onClose={dismissFeedback}
                />
              )}
            </EventDetails>
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
