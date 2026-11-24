import type { Event } from '@/types'
import type { StoryFallbackArg } from '@/views/story-harness'

import { useContext, useState, useLayoutEffect, useRef } from 'react'
import { Flag, ChevronLeft } from 'lucide-react'

import { MobileFooterFade } from '../shared/MobileFooterFade'
import { HostBanner, type BannerHeight } from '../shared/HostBanner'

import { ClassRegistration } from './ClassRegistration'
import { CorrectionPreview } from './CorrectionPreview'
import { WebsiteHeader } from './WebsiteHeader'
import { ClassSharing } from './ClassSharing'
import { ClassActions } from './ClassActions'
import { VenueMapPreview } from './VenueMap'
import { QrPoster } from './QrPoster'
import { PhotoGrid } from './PhotoGrid'
import { ClassFacts } from './ClassFacts'
import {
  classPageFixture,
  fullAddress,
  descriptionParagraphs,
  type ClassPageExample,
} from './fixture'
import { ClassSessionCalendar } from './ClassCalendar'
import { ClassProposalContext, localClassHeading } from './proposal'

import { ViewStory } from '@/views/story-harness'
import { eventTitlesQuery, regionQuery } from '@/config/api'
import { mockLeafRegion } from '@/mocks/regions'
import {
  hasRegisterSlot,
  EventRegisterBar,
} from '@/components/organisms/EventDetails/EventRegister'
import { usePublishedNode } from '@/hooks/use-published-node'
import { setFrame } from '@/lib/overlay'
import { useShareUrl } from '@/hooks/use-share-url'
import { useLocale } from '@/hooks/use-locale'
import { useEventDisplay } from '@/hooks/use-event-display'
import { useIsWide } from '@/config/responsive'
import { EventChips } from '@/components/molecules/EventChips'
import { Button } from '@/components/atoms/Button'

function ClassScreen({
  event,
  desktop,
  description,
  backPlace,
  showCalendar,
  onBack,
  onReport,
  onRegister,
}: {
  event: Event
  desktop: boolean
  description: string[]
  backPlace: string
  showCalendar: boolean
  onBack: () => void
  onReport: () => void
  onRegister: () => void
}) {
  const classUrl = useShareUrl(event.webUrl, event.path)
  const proposal = useContext(ClassProposalContext)
  const { t } = useLocale()
  const { display, contactHelper, blockedMessage } = useEventDisplay(event)
  const whereLineFull = fullAddress(event)
  const shareUrl = display.actions.includes('share') ? classUrl : undefined
  const city = !display.online && event.address?.city
  const place = display.online ? '' : proposal?.confirmedPlace.trim() || city || ''
  const heading = proposal
    ? localClassHeading(event.title, place)
    : city
      ? `${event.title} in ${city}`
      : event.title
  const photos = event.images.flatMap(({ url, alt }) =>
    url ? [{ src: url, alt: alt ?? undefined, caption: alt ?? undefined }] : [],
  )
  const backRow = (
    <div className="sticky top-[var(--class-host-header-height,auto)] z-20 shrink-0 bg-background max-[959px]:mx-auto max-[959px]:w-full max-[959px]:max-w-[var(--sy-content-max,512px)] max-[959px]:px-6 [&_button]:min-h-11 [&>div]:mb-0">
      <Button
        className="-ms-3 min-h-11 gap-0.5 px-2"
        color="primary"
        variant="ghost"
        onClick={onBack}
      >
        <ChevronLeft size={16} />
        Back to {backPlace}
      </Button>
    </div>
  )
  const canRegister = hasRegisterSlot(event, display)
  const pinRegister = !desktop && canRegister && display.registration === 'open'
  let register

  if (!canRegister) register = null
  else if (display.showNearby) {
    register = (
      <div className="space-y-1 text-center">
        {display.full && <p className="text-sm text-gray-11">{blockedMessage}</p>}
        <Button className="w-full" color="primary" variant="flat" onClick={onBack}>
          {t('event.display.see_nearby')}
        </Button>
        {contactHelper && <p className="text-xs text-gray-11">{contactHelper}</p>}
      </div>
    )
  } else if (display.registration !== 'open' || event.registrationMode === 'external') {
    register = <EventRegisterBar basePath={event.path} event={event} />
  } else
    register = desktop ? (
      <ClassRegistration event={event} shareUrl={shareUrl} />
    ) : (
      <Button
        className="w-full bg-primary-12 font-semibold text-white dark:bg-primary-9"
        color="primary"
        size="lg"
        onClick={onRegister}
      >
        Register for free
      </Button>
    )
  const secondaryActions = display.actions.length > 0 && (
    <ClassActions event={event} url={shareUrl} />
  )
  const dropIn = display.kind !== 'course' && !display.online && !display.full
  const calendar = showCalendar && (!proposal || dropIn) && event.schedule && display.next && (
    <div className="w-fit max-w-full min-[960px]:mt-3 [&_button[aria-expanded]]:h-11 [&_button[aria-expanded]]:w-auto [&_button[aria-expanded]]:gap-2 [&_button[aria-expanded]]:bg-transparent [&_button[aria-expanded]]:px-1 [&_button[aria-expanded]]:text-sm [&_button[aria-expanded]]:text-primary-11 [&_button[aria-expanded]:hover]:bg-primary-3">
      <ClassSessionCalendar
        date={display.next.toJSDate()}
        event={event}
        presentation={proposal ? (desktop ? 'menu' : 'sheet') : 'inline'}
        url={shareUrl}
      />
    </div>
  )
  const about = description.length > 0 && (
    <section>
      <h2 className="mb-2 text-base font-semibold">About this class</h2>
      <div
        className={
          desktop
            ? 'flex max-w-[65ch] flex-col gap-3 text-[1.0625rem] leading-[1.6] text-pretty'
            : 'flex flex-col gap-2 text-base leading-normal'
        }
      >
        {description.map((p) => (
          <p key={p}>{p}</p>
        ))}
      </div>
    </section>
  )
  const correction = (
    <button
      className="inline-flex min-h-11 w-fit items-center gap-2 text-start text-sm font-medium text-primary-11"
      type="button"
      onClick={onReport}
    >
      <Flag aria-hidden size={17} />
      <span className="underline decoration-primary-7 underline-offset-4">
        {proposal ? 'Report incorrect class details' : 'Suggest a correction to the class details'}
      </span>
    </button>
  )

  if (desktop) {
    return (
      <main className="mx-auto w-full max-w-[1200px] px-10 pt-6 pb-12 xl:px-12">
        {backRow}
        <h1 className="mt-5 mb-3 text-[clamp(1.875rem,2.7vw,2.25rem)] leading-[1.15] font-semibold tracking-[-0.025em] text-balance break-words">
          {heading}
        </h1>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(328px,0.69fr)] items-start gap-[clamp(36px,5vw,76px)]">
          <article className="min-w-0">
            <EventChips event={event} />
            <section
              aria-label="Class details"
              className="mt-5 border-b border-divider pb-6 text-[1.125rem] leading-[1.4]"
            >
              <ClassFacts detailed event={event} />
              {calendar}
            </section>
            <div className="mt-6 [&_h2]:text-xl">{about}</div>
            {photos.length > 0 && (
              <div className="mt-6">
                <PhotoGrid photos={photos} />
              </div>
            )}
            {shareUrl && (
              <div className="mt-8">
                <QrPoster label={event.title} url={shareUrl} />
              </div>
            )}
          </article>
          <aside
            aria-label="Venue map and class actions"
            className="top-[calc(var(--class-host-header-height)+3.5rem)] min-w-0 has-[[aria-expanded=true]]:static! [@media(min-height:760px)]:sticky"
          >
            <div
              className={proposal ? undefined : 'rounded-2xl border border-divider bg-background'}
            >
              {display.actions.includes('directions') && (
                <VenueMapPreview desktop event={event} register={register} where={whereLineFull} />
              )}
              <div className={`flex flex-col gap-4 ${proposal ? 'pt-4' : 'p-5'}`}>
                {(display.actions.includes('website') || display.actions.includes('contact')) && (
                  <ClassActions inline event={event} url={shareUrl} />
                )}
                {register}
                {shareUrl && <ClassSharing title={event.title} url={shareUrl} />}
              </div>
            </div>
            <div className={proposal ? 'mt-4 border-t border-divider pt-1' : 'mt-1 px-5'}>
              {correction}
            </div>
          </aside>
        </div>
      </main>
    )
  }

  return (
    <>
      {backRow}
      <h1 className="mx-auto w-full max-w-[720px] px-6 pt-2 pb-3 text-xl leading-tight font-semibold">
        {heading}
      </h1>
      <div>
        <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4 px-6 pt-1 pb-10">
          <EventChips event={event} />
          {display.actions.includes('directions') && (
            <VenueMapPreview event={event} register={register} where={whereLineFull} />
          )}
          <div className="flex flex-col gap-1">
            <ClassFacts event={event} />
            {calendar}
          </div>
          {secondaryActions}
          {!pinRegister && register}
          {about}
          <PhotoGrid photos={photos} />
          {shareUrl && <QrPoster inline={!proposal} label={event.title} url={shareUrl} />}
          {correction}
        </div>
      </div>
      {pinRegister && (
        <footer className="pointer-events-none sticky bottom-0 z-20 mx-auto w-full max-w-[720px] bg-background px-6 pt-2 pb-[max(8px,env(safe-area-inset-bottom))]">
          <MobileFooterFade />
          <div className="pointer-events-auto">{register}</div>
        </footer>
      )}
    </>
  )
}
export type ClassExample = {
  example: ClassPageExample
  state: StoryFallbackArg
  showCalendar: boolean
  showPhotos: boolean
  shortDescription: boolean
  banner?: BannerHeight
}
export function ClassPage({
  example,
  state,
  banner,
  showPhotos,
  shortDescription,
  showCalendar,
}: ClassExample) {
  const event = classPageFixture(example)

  return (
    <ClassPageLayout
      banner={banner}
      description={descriptionParagraphs(event, shortDescription)}
      event={showPhotos ? event : { ...event, images: [] }}
      showCalendar={showCalendar}
      state={state}
    />
  )
}

export function ClassPageLayout({
  event,
  description,
  banner,
  backPlace = 'United Kingdom',
  state,
  showCalendar = true,
  onBack,
}: {
  event: Event
  description: string[]
  banner?: BannerHeight
  backPlace?: string
  state?: StoryFallbackArg
  showCalendar?: boolean
  onBack?: () => void
}) {
  const [page, setPage] = useState<'class' | 'region' | 'registration' | 'correction'>('class')
  const { locale } = useLocale()
  const back = () => setPage('class')
  const { node: scroller, adopt } = usePublishedNode<HTMLDivElement>(setFrame)
  const desktop = useIsWide(scroller)
  const shareUrl = useShareUrl(event.webUrl, event.path)
  const previousScroll = useRef(0)
  const navigate = (next: typeof page) => {
    previousScroll.current = scroller?.scrollTop ?? 0
    setPage(next)
  }

  useLayoutEffect(() => {
    if (scroller) scroller.scrollTop = page === 'class' ? previousScroll.current : 0
  }, [page, scroller])

  return (
    <div
      ref={adopt}
      className="fixed inset-0 overflow-y-auto bg-background text-foreground [--class-host-header-height:calc(3.5rem+1px)] [--sy-content-max:720px]"
    >
      <WebsiteHeader />
      {banner && page === 'class' && (
        <div className="mx-auto min-[960px]:max-w-[1200px] min-[960px]:px-10 min-[960px]:pt-5 xl:px-12">
          <HostBanner height={banner} />
        </div>
      )}

      {scroller && (
        <div>
          <ViewStory
            example={`${event.id}-${locale}`}
            height="container"
            mode={{ standalone: false }}
            path={event.path}
            seed={(client) => {
              client.setQueryData(
                eventTitlesQuery(locale).queryKey,
                new Map([[event.id, event.title]]),
              )
              if (event.region?.slug === mockLeafRegion.slug) {
                client.setQueryData(
                  regionQuery(mockLeafRegion.slug, locale).queryKey,
                  mockLeafRegion,
                )
              }
            }}
            state={state}
          >
            {page === 'registration' ? (
              <ClassRegistration event={event} shareUrl={shareUrl} onBack={back} />
            ) : page === 'correction' ? (
              <CorrectionPreview
                description={description.join('\n\n')}
                event={event}
                onClose={back}
              />
            ) : page === 'region' ? (
              <section className="mx-auto max-w-3xl p-6">
                <h1 className="mb-4 text-2xl font-semibold">United Kingdom</h1>
                <Button variant="flat" onClick={back}>
                  {event.title} in {event.address?.city}
                </Button>
              </section>
            ) : (
              <ClassScreen
                backPlace={backPlace}
                description={description}
                desktop={desktop}
                event={event}
                showCalendar={showCalendar}
                onBack={onBack ?? (() => navigate('region'))}
                onRegister={() => navigate('registration')}
                onReport={() => navigate('correction')}
              />
            )}
          </ViewStory>
        </div>
      )}
    </div>
  )
}
