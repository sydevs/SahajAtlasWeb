import type { OpenedListing, PickedPlace, ZonedPoint } from '@/lib/proposal'
import type { Event, Geojson, Region } from '@/types'
import type { ReactNode } from 'react'

import { useCallback, useLayoutEffect, useMemo, useRef } from 'react'
import { useLocation } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'

import { ListingDetails } from './ListingDetails'

import { type SubmitEntry, submitTitleKey } from '@/lib/shape'
import { DrawerBody } from '@/components/atoms/Drawer'
import { IpLookupContext } from '@/hooks/use-ip-location'
import { EventHeader } from '@/components/organisms/EventDetails/EventHeader'
import { ProposalForm } from '@/components/organisms/ProposalForm'
import { regionQuery } from '@/config/api'
import { useWidgetMode } from '@/config/mode'
import { useListingDraft } from '@/config/store'
import { useLocale } from '@/hooks/use-locale'
import { useMapController } from '@/hooks/use-map-controller'
import { nearestTimeZone, openListing, previewEvent, searchProximity } from '@/lib/proposal'
import { buildReportContext } from '@/lib/report'
import { viewerTimeZone } from '@/lib/time'
import { CloseButton, useDrawerControl, useEventFromPath, useFrameOnTop } from '@/views/shared'

/**
 * The add-a-class and correction flows (#147), at `<region-path>/add`, `/add` and
 * `<event-path>/correct`.
 *
 * Two surfaces share one draft, held in `useListingDraft`: `SubmitView` is the listing in the
 * stack's base sheet, built live from what the visitor has entered, and `SubmitPanel` is the
 * step panel DrawerStack renders beside it — from the right on a wide widget, rising from the
 * bottom on a narrow one. A map-less embed has no room for a second sheet, so there the panel
 * renders above the listing inside this view instead.
 */

/** What a flow opened on: the route's own draft, and whatever place or class it opened over. */
type FlowTarget = {
  key: string
  path: string
  event?: Event
  region?: Region
  open: () => OpenedListing
}

function AddTarget({
  entry,
  children,
}: {
  entry: Extract<SubmitEntry, { kind: 'add' }>
  children: (target: FlowTarget) => ReactNode
}) {
  const { locale, languageCode } = useLocale()
  // Only for a starting point and a camera — a miss costs neither the flow nor the listing.
  const { data: region } = useQuery({
    ...regionQuery(entry.regionSlug ?? '', locale),
    enabled: entry.regionSlug !== null,
  })

  return children({
    key: `add:${entry.path}`,
    path: entry.path,
    region,
    open: () => openListing({ timeZone: viewerTimeZone(), languages: [languageCode] }),
  })
}

function CorrectionTarget({
  entry,
  children,
}: {
  entry: Extract<SubmitEntry, { kind: 'correct' }>
  children: (target: FlowTarget) => ReactNode
}) {
  const { data: event } = useEventFromPath(entry.eventPath)

  return children({
    key: `correct:${event.id}`,
    path: entry.path,
    event,
    open: () => openListing({ event }),
  })
}

function WithTarget({
  entry,
  children,
}: {
  entry: SubmitEntry
  children: (target: FlowTarget) => ReactNode
}) {
  return entry.kind === 'correct' ? (
    <CorrectionTarget entry={entry}>{children}</CorrectionTarget>
  ) : (
    <AddTarget entry={entry}>{children}</AddTarget>
  )
}

/**
 * The route's draft, started when the flow opens. Both surfaces call this, and only the first
 * to commit starts it. A draft already sent starts over, so reopening the flow is a new listing.
 */
function useListingSession(target: FlowTarget) {
  const session = useListingDraft(
    useShallow((state) => ({
      key: state.key,
      draft: state.draft,
      base: state.base,
      step: state.step,
      sent: state.sent,
    })),
  )

  // Keyed on the route alone: the target object is rebuilt every render.
  const open = useRef(target.open)

  open.current = target.open

  useLayoutEffect(() => {
    const current = useListingDraft.getState()

    if (current.key === target.key && !current.sent) return

    const { draft, base, step } = open.current()

    current.start(target.key, draft, step, base)
  }, [target.key])

  return session.key === target.key ? session : null
}

/** Classes already on the map, as the zones they lend a nearby place. Read from cache only. */
function useFeedHints() {
  const queryClient = useQueryClient()

  return useMemo(() => {
    const feed = queryClient.getQueryData<Geojson>(['geojson'])
    const points: ZonedPoint[] = []
    const languages = new Set<string>()

    for (const feature of feed?.features ?? []) {
      const timeZone = feature.properties.schedule?.firstDate_tz

      feature.properties.languages.forEach((code) => languages.add(code))
      if (feature.geometry && timeZone)
        points.push({ position: feature.geometry.coordinates, timeZone })
    }

    return { points, languages: [...languages] }
  }, [queryClient])
}

function FlowPanel({ target, trailing }: { target: FlowTarget; trailing?: ReactNode }) {
  const session = useListingSession(target)
  const { dismiss } = useDrawerControl()
  const { locale } = useLocale()
  const location = useLocation()
  const hints = useFeedHints()
  const timeZoneFor = useCallback(
    (place: PickedPlace) => nearestTimeZone(place, hints.points),
    [hints.points],
  )

  if (!session?.draft) return null

  const { update, setStep, markSent } = useListingDraft.getState()

  return (
    <ProposalForm
      context={buildReportContext({ path: location.pathname, locale })}
      correction={
        target.event && session.base
          ? { eventId: target.event.id, baseDraft: session.base }
          : undefined
      }
      draft={session.draft}
      languageOptions={hints.languages}
      proximity={searchProximity(target.region?.center)}
      sent={session.sent}
      step={session.step}
      timeZoneFor={timeZoneFor}
      trailing={trailing}
      onChange={update}
      onClose={dismiss}
      onSent={markSent}
      onStep={setStep}
    />
  )
}

function Listing({ target, inlinePanel }: { target: FlowTarget; inlinePanel: boolean }) {
  const { t } = useTranslation()
  const session = useListingSession(target)
  const { frameEvent, frameRegion } = useMapController()
  const { event, region } = target

  useFrameOnTop(
    ({ isEntry }) => {
      if (event) frameEvent(event, { isEntry })
      else if (region) frameRegion(region)
    },
    [event, region, frameEvent, frameRegion],
  )

  const listing = useMemo(
    () =>
      session?.draft
        ? previewEvent(session.draft, {
            path: target.path,
            base: event && session.base ? { event, draft: session.base } : undefined,
          })
        : null,
    [session?.draft, session?.base, event, target.path],
  )

  if (!session || !listing) return null

  const { setStep } = useListingDraft.getState()
  const title = listing.title || t(submitTitleKey(event ? 'correct' : 'add'))

  return (
    <>
      <EventHeader event={{ ...listing, title }} trailing={<CloseButton />} />
      <DrawerBody>
        {inlinePanel && (
          <div className="mx-6 mb-4 rounded-lg border border-divider">
            <FlowPanel target={target} />
          </div>
        )}
        {!session.sent && (
          <p className="mx-6 mb-2 text-xs text-gray-11">{t('submit.chrome.preview_note')}</p>
        )}
        <IpLookupContext.Provider value={false}>
          <ListingDetails
            listing={listing}
            path={target.path}
            onEdit={session.step === 'review' && !session.sent ? setStep : undefined}
          />
        </IpLookupContext.Provider>
      </DrawerBody>
    </>
  )
}

/** The listing behind the panel — the base sheet's view for the flow's routes. */
export function SubmitView({ entry }: { entry: SubmitEntry }) {
  const { hasMap } = useWidgetMode()

  return (
    <WithTarget entry={entry}>
      {(target) => <Listing inlinePanel={!hasMap} target={target} />}
    </WithTarget>
  )
}

/** The step panel, as DrawerStack mounts it in its own sheet beside the listing. */
export function SubmitPanel({ entry }: { entry: SubmitEntry }) {
  return (
    <DrawerBody>
      <WithTarget entry={entry}>
        {(target) => <FlowPanel target={target} trailing={<CloseButton />} />}
      </WithTarget>
    </DrawerBody>
  )
}
