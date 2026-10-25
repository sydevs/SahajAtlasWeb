import type { ListingDraft, OpenedListing, PickedPlace, ScheduleFields } from '@/lib/proposal'
import type { Event, Region } from '@/types'
import type { ReactNode } from 'react'

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useLocation } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'
import { Check } from 'lucide-react'

import { ChangeList, ListingCard, SendHeader, TitleField } from './parts'
import { NearbyClassNotice } from './NearbyClassNotice'
import { useFeedHints } from './use-feed-hints'
import { useNearbyClasses } from './use-nearby-classes'

import { type SubmitEntry } from '@/lib/shape'
import { Button } from '@/components/atoms/Button'
import { DrawerBody, DrawerFooter } from '@/components/atoms/Drawer'
import { Input } from '@/components/atoms/Input'
import { FormField } from '@/components/molecules/FormField'
import {
  type SectionKey,
  ListingEditor,
  SendForm,
  blockingSections,
  changedSections,
} from '@/components/organisms/ListingEditor'
import { IpLookupContext } from '@/hooks/use-ip-location'
import { regionQuery } from '@/config/api'
import { useWidgetMode } from '@/config/mode'
import { useIsWideWidget } from '@/config/responsive'
import { useListingDraft } from '@/config/store'
import { useLocale } from '@/hooks/use-locale'
import { useMapController } from '@/hooks/use-map-controller'
import {
  draftPlace,
  draftPreviewSchedule,
  draftToPatch,
  nearestTimeZone,
  openListing,
  previewEvent,
  revertFields,
  searchProximity,
} from '@/lib/proposal'
import { buildReportContext } from '@/lib/report'
import { viewerTimeZone } from '@/lib/time'
import { CloseButton, useDrawerControl, useEventFromPath, useFrameOnTop } from '@/views/shared'

/**
 * The add-a-class and correction flows (#147), at `<region-path>/add`, `/add` and
 * `<event-path>/correct`.
 *
 * One surface, in the stack's own sheet like any other view: the listing itself, editable in
 * place (`ListingEditor`), then a short send step, then the receipt. The draft lives in
 * `useListingDraft`, so crossing the breakpoint — which remounts the sheet — loses nothing.
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
      phase: state.phase,
      zonePinned: state.zonePinned,
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
    endDate = '',
    timeZone = 'UTC',
  }: Partial<ScheduleFields> = draft ?? {}

  return useMemo(
    () => draftPreviewSchedule({ firstDate, startTime, endTime, repeats, endDate, timeZone }),
    [firstDate, startTime, endTime, repeats, endDate, timeZone],
  )
}

function Flow({ target }: { target: FlowTarget }) {
  const { t } = useTranslation()
  const session = useListingSession(target)
  const { dismiss } = useDrawerControl()
  const { locale } = useLocale()
  const location = useLocation()
  const { hasMap } = useWidgetMode()
  const isWide = useIsWideWidget()
  // On the snap-ladder bottom sheet a footer in the flow would scroll away; pin it there.
  const sticky = hasMap && !isWide
  const hints = useFeedHints()
  const timeZoneFor = useCallback(
    (place: PickedPlace) => nearestTimeZone(place, hints.points),
    [hints.points],
  )
  const { frameEvent, frameRegion, frameSearch } = useMapController()
  const { event, region } = target
  // Sections whose errors a failed Done or Continue has revealed.
  const [attempted, setAttempted] = useState<SectionKey[]>([])
  // The correction's "it's no longer running" report, which the send step words differently.
  const [stopped, setStopped] = useState(false)

  useFrameOnTop(
    ({ isEntry }) => {
      if (event) frameEvent(event, { isEntry })
      else if (region) frameRegion(region)
    },
    [event, region, frameEvent, frameRegion],
  )

  const draft = session?.draft ?? null
  const base = session?.base ?? null
  const nearby = useNearbyClasses(
    draft && !event && draft.eventType === 'offline' ? draft.address : null,
  )
  // Typing re-renders the editor at once and lets the rendered sections catch up.
  const deferred = useDeferredValue(draft)
  const basePatch = useMemo(() => (base ? draftToPatch(base) : undefined), [base])
  const schedule = usePreviewSchedule(deferred)
  const listing = useMemo(
    () =>
      deferred
        ? previewEvent(deferred, {
            path: target.path,
            base: event && base ? { event, draft: base, patch: basePatch } : undefined,
            schedule,
          })
        : null,
    [deferred, base, basePatch, schedule, event, target.path],
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

  if (!session || !draft || !listing) return null

  const { update, setSender, setStep, setPhase, markSent } = useListingDraft.getState()
  const correction = event && base ? { eventId: event.id, baseDraft: base } : undefined

  if (session.sent) {
    const city = draftPlace(draft)?.city ?? event?.region?.name ?? undefined

    return (
      <>
        <SendHeader title={t('submit.done.title_sent')} />
        <DrawerBody className={sticky ? 'pb-24' : undefined}>
          <div className="flex flex-col items-center gap-3 px-6 pt-4 pb-6 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-primary-3 text-primary-11">
              <Check aria-hidden size={28} strokeWidth={2.5} />
            </span>
            <p className="text-md leading-snug font-medium">
              {city ? t('submit.done.body', { city }) : t('submit.done.body_no_city')}
            </p>
            {session.sender.email.trim() && (
              <p className="text-sm text-gray-11">
                {t('submit.done.email', { email: session.sender.email.trim() })}
              </p>
            )}
          </div>
          {!stopped && (
            <div className="px-4 pb-6 md:px-6">
              <IpLookupContext.Provider value={false}>
                <ListingCard listing={listing} status={t('submit.done.pending')} />
              </IpLookupContext.Provider>
            </div>
          )}
        </DrawerBody>
        <DrawerFooter className="border-t border-divider px-4 py-3 md:px-6" sticky={sticky}>
          <Button
            className="h-12 w-full text-base md:h-11"
            color="primary"
            variant="solid"
            onClick={dismiss}
          >
            {t('submit.done.back_to_map')}
          </Button>
        </DrawerFooter>
      </>
    )
  }

  if (session.phase === 'send') {
    const leaveSend = () => {
      if (stopped && base) {
        // Back out of the report: the last date and the prefilled note were only its own.
        update(revertFields(base, ['endDate']))
        setSender({ note: '' })
        setStopped(false)
      }
      setPhase('edit')
    }

    return (
      <>
        <SendHeader
          title={t(
            stopped
              ? 'submit.stopped.title'
              : correction
                ? 'submit.review.title_correct'
                : 'submit.review.title_add',
          )}
          onBack={leaveSend}
        />
        <IpLookupContext.Provider value={false}>
          <SendForm
            context={buildReportContext({ path: location.pathname, locale })}
            correction={correction}
            draft={draft}
            sender={session.sender}
            stickyFooter={sticky}
            onInvalid={(step) => {
              setAttempted((current) => [...new Set([...current, step as SectionKey])])
              setStep(step)
              setPhase('edit')
            }}
            onSender={setSender}
            onSent={markSent}
          >
            {stopped ? (
              <>
                <div className="flex flex-col gap-1 rounded-xl bg-primary-2 p-4 text-sm leading-snug text-primary-12">
                  {event && (
                    <p className="font-semibold">
                      {t('submit.stopped.subject', { title: event.title })}
                    </p>
                  )}
                  <p>{t('submit.stopped.body')}</p>
                </div>
                {draft.repeats !== 'once' && (
                  <FormField htmlFor="submit-last-date" label={t('submit.stopped.last_date')}>
                    <Input
                      className="h-11 text-base md:h-10 md:text-sm"
                      id="submit-last-date"
                      max={new Date().toISOString().slice(0, 10)}
                      type="date"
                      value={draft.endDate}
                      onChange={(change) => update({ endDate: change.target.value })}
                    />
                  </FormField>
                )}
              </>
            ) : correction && base && event ? (
              <ChangeList base={base} before={event} draft={draft} listing={listing} />
            ) : (
              <ListingCard
                details={draft}
                label={t('submit.review.listing_label')}
                listing={listing}
                note={t('submit.review.listing_note')}
              />
            )}
          </SendForm>
        </IpLookupContext.Provider>
      </>
    )
  }

  const blocking = blockingSections(draft, base)
  const changes = base ? changedSections(draft, base).length : 0
  const needs = (['where', 'when'] as const).filter((key) => blocking.includes(key))
  const editing = session.step !== 'review'
  const status = editing ? (
    t('submit.chrome.finish_part')
  ) : base ? (
    changes ? (
      <span className="font-medium text-foreground">
        {t('submit.chrome.changes', { count: changes })}
      </span>
    ) : (
      t('submit.chrome.no_changes')
    )
  ) : needs.length === 2 ? (
    t('submit.chrome.needs_both')
  ) : needs.length === 1 ? (
    t(needs[0] === 'where' ? 'submit.chrome.needs_where' : 'submit.chrome.needs_when')
  ) : blocking.length === 0 ? (
    <span className="flex items-center gap-1.5 font-medium text-primary-11">
      <Check aria-hidden size={16} strokeWidth={2.5} />
      {t('submit.chrome.ready')}
    </span>
  ) : null

  const onContinue = () => {
    if (blocking.length > 0) {
      setAttempted((current) => [...new Set([...current, ...blocking])])
      const first = blocking.find((key) => key !== 'title')

      if (first) setStep(first)

      return
    }
    setStep('review')
    setPhase('send')
  }

  return (
    <>
      <div className="flex shrink-0 items-start gap-2 px-4 pt-1 pb-2 md:px-6 md:pt-4">
        <TitleField base={base} draft={draft} onChange={update} />
        <CloseButton />
      </div>
      <DrawerBody className={sticky ? 'pb-24' : undefined}>
        <IpLookupContext.Provider value={false}>
          <ListingEditor
            attempted={attempted}
            base={base}
            country={target.country}
            draft={draft}
            languageOptions={hints.languages}
            listing={listing}
            mapInView={hasMap && isWide}
            open={session.step}
            placeNotice={<NearbyClassNotice classes={nearby} />}
            proximity={searchProximity(target.region?.center)}
            timeZoneFor={timeZoneFor}
            zonePinned={session.zonePinned}
            onAttempt={(key) => setAttempted((current) => [...new Set([...current, key])])}
            onChange={update}
            onOpen={setStep}
            onPinZone={useListingDraft.getState().pinZone}
            onStopped={
              base
                ? () => {
                    setStopped(true)
                    setSender({ note: `${t('submit.stopped.note_prefix')} ` })
                    setStep('review')
                    setPhase('send')
                  }
                : undefined
            }
          />
        </IpLookupContext.Provider>
      </DrawerBody>
      <DrawerFooter
        className="flex items-center gap-3 border-t border-divider px-4 py-3 md:px-6"
        sticky={sticky}
      >
        <p aria-live="polite" className="min-w-0 flex-1 text-sm leading-snug text-gray-11">
          {status}
        </p>
        <Button className="h-11 shrink-0 px-6" color="primary" variant="solid" onClick={onContinue}>
          {t('submit.chrome.continue')}
        </Button>
      </DrawerFooter>
    </>
  )
}

/** The flow's one view: the editable listing, its send step, and the receipt. */
export function SubmitView({ entry }: { entry: SubmitEntry }) {
  return <WithTarget entry={entry}>{(target) => <Flow target={target} />}</WithTarget>
}
