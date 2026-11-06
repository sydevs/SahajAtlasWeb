import type { ListingDraft, OpenedListing, PickedPlace, ScheduleFields } from '@/lib/proposal'
import type { Event, Region } from '@/types'
import type { ReactNode } from 'react'

import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useLocation } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { useShallow } from 'zustand/react/shallow'

import { ListingDetails } from './ListingDetails'
import { NearbyClassNotice } from './NearbyClassNotice'
import { useFeedHints } from './use-feed-hints'
import { useNearbyClasses } from './use-nearby-classes'

import { type SubmitEntry } from '@/lib/shape'
import { IpLookupContext } from '@/hooks/use-ip-location'
import { ProposalForm } from '@/components/organisms/ProposalForm'
import { regionQuery } from '@/config/api'
import { useWidgetMode } from '@/config/mode'
import { useIsWideWidget } from '@/config/responsive'
import { useListingDraft } from '@/config/store'
import { useLocale } from '@/hooks/use-locale'
import { useMapController } from '@/hooks/use-map-controller'
import {
  draftPreviewSchedule,
  draftToPatch,
  nearestTimeZone,
  openListing,
  previewEvent,
  searchProximity,
} from '@/lib/proposal'
import { buildReportContext } from '@/lib/report'
import { viewerTimeZone } from '@/lib/time'
import { CloseButton, useDrawerControl, useEventFromPath, useFrameOnTop } from '@/views/shared'

/**
 * The add-a-class and correction flows (#147), at `<region-path>/add`, `/add` and
 * `<event-path>/correct`.
 *
 * One surface, in the stack's own sheet like any other view: the step form, and under it the
 * listing built live from the same draft, held in `useListingDraft`.
 */

/** What a flow opened on: the route's own draft, and whatever place or class it opened over. */
type FlowTarget = {
  key: string
  path: string
  event?: Event
  region?: Region
  open: () => OpenedListing
  /** ISO 3166-1 alpha-2 of the country the flow opened in, which the place searches keep to. */
  country?: string
}

/** The country a region path sits in: its first segment, which is the country's ISO code. */
const pathCountry = (path: string): string | undefined => {
  const first = path.split('/').filter(Boolean)[0]

  return first && /^[a-z]{2}$/i.test(first) ? first.toLowerCase() : undefined
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
    country: entry.regionSlug === null ? undefined : pathCountry(entry.path),
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
 * to commit starts it. A sent draft starts over only when the flow is reopened — a new history
 * entry — never when a surface remounts, as the step panel does crossing the breakpoint.
 */
function useListingSession(target: FlowTarget) {
  const session = useListingDraft(
    useShallow((state) => ({
      key: state.key,
      draft: state.draft,
      sender: state.sender,
      base: state.base,
      step: state.step,
      reviewed: state.reviewed,
      intent: state.intent,
      reported: state.reported,
      nobodyOn: state.nobodyOn,
      sent: state.sent,
    })),
  )
  const { key: entry } = useLocation()

  // Keyed on the route alone: the target object is rebuilt every render.
  const open = useRef(target.open)

  open.current = target.open

  useLayoutEffect(() => {
    const current = useListingDraft.getState()

    if (current.key === target.key && (!current.sent || current.entry === entry)) return

    current.start({ key: target.key, entry }, open.current())
  }, [target.key, entry])

  return session.key === target.key ? session : null
}

/** The draft's schedule preview, rebuilt only when a field it reads changes. */
function usePreviewSchedule(draft: ListingDraft | null) {
  const {
    firstDate = '',
    startTime = '',
    endTime = '',
    repeats = 'once',
    monthlyBy = 'date',
    endDate = '',
    timeZone = 'UTC',
  }: Partial<ScheduleFields> = draft ?? {}

  return useMemo(
    () =>
      draftPreviewSchedule({
        firstDate,
        startTime,
        endTime,
        repeats,
        monthlyBy,
        endDate,
        timeZone,
      }),
    [firstDate, startTime, endTime, repeats, monthlyBy, endDate, timeZone],
  )
}

/**
 * The flow on one sheet: the guided steps, with the listing they build — used for the schedule
 * summary as it is filled in, and shown whole on Check.
 */
function Flow({ target }: { target: FlowTarget }) {
  const session = useListingSession(target)
  const { dismiss } = useDrawerControl()
  const { locale } = useLocale()
  const location = useLocation()
  const hints = useFeedHints()
  const { hasMap } = useWidgetMode()
  const isWide = useIsWideWidget()
  const { frameEvent, frameRegion, frameSearch } = useMapController()
  const { event, region } = target

  useFrameOnTop(
    ({ isEntry }) => {
      if (event) frameEvent(event, { isEntry })
      else if (region) frameRegion(region)
    },
    [event, region, frameEvent, frameRegion],
  )

  // Typing re-renders the form at once and lets the listing built from it catch up.
  const draft = useDeferredValue(session?.draft ?? null)
  const base = session?.base ?? null
  const basePatch = useMemo(() => (base ? draftToPatch(base) : undefined), [base])
  const schedule = usePreviewSchedule(draft)
  const listing = useMemo(
    () =>
      draft
        ? previewEvent(draft, {
            path: target.path,
            base: event && base ? { event, draft: base, patch: basePatch } : undefined,
            schedule,
          })
        : null,
    [draft, base, basePatch, schedule, event, target.path],
  )
  const nearby = useNearbyClasses(
    draft && !event && draft.eventType === 'offline' ? draft.address : null,
  )
  const timeZoneFor = useCallback(
    (place: PickedPlace) => nearestTimeZone(place, hints.points),
    [hints.points],
  )

  // A picked place drops its pin, so the visitor sees where the class will show on the map; a
  // dropped one takes its pin with it. Only a change frames: on mount the camera is
  // `useFrameOnTop`'s, which restores where the visitor left it on a Back.
  const point = listing?.eventType === 'offline' ? listing.address : null
  const pinKey = point?.latitude != null ? `${point.latitude},${point.longitude}` : null
  const framedPin = useRef(pinKey)

  useEffect(() => {
    if (pinKey === framedPin.current) return
    framedPin.current = pinKey
    if (pinKey && listing) frameEvent(listing)
    else frameSearch({})
    // Keyed on the point alone: the listing is rebuilt on every keystroke.
  }, [pinKey, frameEvent, frameSearch])

  if (!session?.draft || !listing) return null

  const { update, setSender, setStep, setIntent, clearReport, setNobodyOn, markSent } =
    useListingDraft.getState()

  return (
    // The preview names no viewer's place, so nothing here may ping the IP lookup.
    <IpLookupContext.Provider value={false}>
      <ProposalForm
        context={buildReportContext({ path: location.pathname, locale })}
        correction={
          event && session.base ? { eventId: event.id, baseDraft: session.base, event } : undefined
        }
        country={target.country}
        draft={session.draft}
        intent={session.intent}
        languageOptions={hints.languages}
        listing={listing}
        nobodyOn={session.nobodyOn}
        placeMap={hasMap && !isWide}
        placeNotice={<NearbyClassNotice classes={nearby} />}
        placeSearch={hasMap}
        preview={
          <ListingDetails
            listing={listing}
            path={target.path}
            onEdit={session.sent ? undefined : setStep}
          />
        }
        proximity={searchProximity(region?.center)}
        reported={session.reported}
        reviewed={session.reviewed}
        sender={session.sender}
        sent={session.sent}
        step={session.step}
        stickyFooter={hasMap && !isWide}
        timeZoneFor={timeZoneFor}
        trailing={<CloseButton />}
        onChange={update}
        onClearReport={clearReport}
        onClose={dismiss}
        onIntent={setIntent}
        onNobodyOn={setNobodyOn}
        onSender={setSender}
        onSent={markSent}
        onStep={setStep}
      />
    </IpLookupContext.Provider>
  )
}

/** The flow's one view. */
export function SubmitView({ entry }: { entry: SubmitEntry }) {
  return <WithTarget entry={entry}>{(target) => <Flow target={target} />}</WithTarget>
}
