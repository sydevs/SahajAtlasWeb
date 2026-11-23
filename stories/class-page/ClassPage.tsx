import type { Event } from '@/types'

import { useState, useLayoutEffect, useRef } from 'react'
import { useMediaQuery } from 'react-responsive'
import { Flag, ChevronLeft } from 'lucide-react'

import { ClassRegistration } from './ClassRegistration'
import { CorrectionPreview } from './CorrectionPreview'
import { WebsiteHeader } from './WebsiteHeader'
import { ClassSharing } from './ClassSharing'
import { ClassActions } from './ClassActions'
import { VenueMapPreview } from './VenueMap'
import { QrPoster } from './QrPoster'
import { PhotoGrid } from './PhotoGrid'
import { ClassFacts } from './ClassFacts'
import { classFixture, fullAddress, descriptionParagraphs } from './fixture'
// Shri Mataji teaching, from https://shrimataji.org/reading-room/
import hostBannerPhoto from './host-banner.webp'
import { ClassCalendar } from './ClassCalendar'

import { ViewHarness } from '@/views/story-harness'
import { usePublishedNode } from '@/hooks/use-published-node'
import { setFrame } from '@/lib/overlay'
import { useShareUrl } from '@/hooks/use-share-url'
import { useLocale } from '@/hooks/use-locale'
import { useEventDisplay } from '@/hooks/use-event-display'
import { useIsWideWidget } from '@/config/responsive'
import { EventChips } from '@/components/molecules/EventChips'
import { Button } from '@/components/atoms/Button'

function ClassScreen({
  event,
  desktop,
  short,
  onBack,
  onReport,
  onRegister,
}: {
  event: Event
  desktop: boolean
  short: boolean
  onBack: () => void
  onReport: () => void
  onRegister: () => void
}) {
  const wide = useIsWideWidget()
  const shareUrl = useShareUrl(event.webUrl, event.path)
  const { display } = useEventDisplay(event)
  const whereLineFull = fullAddress(event)
  const city = event.address?.city
  const heading = city ? `${event.title} in ${city}` : event.title
  const desktopShareUrl = desktop && display.actions.includes('share') ? shareUrl : undefined
  const nextSession = display.next?.toJSDate()
  const description = descriptionParagraphs(short)
  const photos = event.images.flatMap(({ url, alt }) =>
    url ? [{ src: url, alt: alt ?? undefined, caption: alt ?? undefined }] : [],
  )
  const backRow = (
    <div className="sticky top-[var(--class-host-header-height)] z-20 shrink-0 bg-background max-[959px]:mx-auto max-[959px]:w-full max-[959px]:max-w-[var(--sy-content-max,512px)] max-[959px]:px-6 [&_button]:min-h-11 [&>div]:mb-0">
      <Button className="-ms-2 min-h-11" color="primary" variant="ghost" onClick={onBack}>
        <ChevronLeft size={16} />
        Back to United Kingdom
      </Button>
    </div>
  )
  const register = desktop ? (
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
  const secondaryActions = <ClassActions event={event} url={shareUrl} />
  const calendar = event.schedule && display.next && display.nextEnd && nextSession && (
    <div className="w-fit max-w-full min-[960px]:mt-3 [&_button[aria-expanded]]:h-11 [&_button[aria-expanded]]:w-auto [&_button[aria-expanded]]:gap-2 [&_button[aria-expanded]]:bg-transparent [&_button[aria-expanded]]:px-1 [&_button[aria-expanded]]:text-sm [&_button[aria-expanded]]:text-primary-11 [&_button[aria-expanded]:hover]:bg-primary-3">
      <ClassCalendar
        end={display.nextEnd}
        event={{
          id: `${event.id}-${nextSession.getTime()}`,
          title: event.title,
          from: nextSession,
          schedule: { ...event.schedule, recurrenceType: null, exclusions: [] },
          location: display.online ? undefined : whereLineFull,
          url: shareUrl,
        }}
        start={display.next}
      />
    </div>
  )
  const about = (
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
        Report a problem with this class
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
              className="mt-5 border-b border-divider pb-4 text-[1.125rem] leading-[1.4]"
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
            <div className="rounded-2xl border border-divider bg-background">
              <VenueMapPreview
                event={event}
                register={register}
                renderDesktopPanel={(directions) => (
                  <>
                    <h2 className="px-6 pt-4 pb-3 text-xl font-semibold">{event.title}</h2>
                    <div className="flex flex-col gap-4 px-6 pt-1 pb-6">
                      <EventChips event={event} />
                      <ClassFacts event={event} />
                      {register}
                      <div className="flex gap-2 [&>div]:contents [&>div>div]:contents">
                        {directions}
                        {secondaryActions}
                      </div>
                      {about}
                      {photos.length > 0 && <PhotoGrid photos={photos} />}
                      {correction}
                    </div>
                  </>
                )}
                where={whereLineFull}
              />
              <div className="flex flex-col gap-4 p-5">
                <ClassActions inline event={event} url={shareUrl} />
                {register}
                {desktopShareUrl && <ClassSharing title={event.title} url={desktopShareUrl} />}
              </div>
            </div>
            <div className="mt-1 px-5">{correction}</div>
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
          <VenueMapPreview event={event} register={register} where={whereLineFull} />
          <div className="flex flex-col gap-1">
            <ClassFacts event={event} />
            {calendar}
          </div>
          {secondaryActions}
          {wide && register}
          {about}
          <PhotoGrid photos={photos} />
          {shareUrl && <QrPoster inline label={event.title} url={shareUrl} />}
          {correction}
        </div>
      </div>
      {!wide && (
        <footer className="pointer-events-none sticky bottom-0 z-20 mx-auto w-full max-w-[720px] bg-background px-6 pt-2 pb-[max(8px,env(safe-area-inset-bottom))]">
          {/* Finish the fade above the button so scrolling text disappears before the CTA. */}
          <div
            aria-hidden
            className="absolute inset-x-0 bottom-full h-4"
            style={{
              backgroundImage:
                'linear-gradient(to bottom, hsl(var(--background) / 0), hsl(var(--background) / 0.6) 64%, hsl(var(--background)))',
            }}
          />
          <div className="pointer-events-auto">{register}</div>
        </footer>
      )}
    </>
  )
}
export type ClassExample = {
  showPhotos: boolean
  shortDescription: boolean
  showHostBanner: boolean
}
export function ClassPage({ showHostBanner, showPhotos, shortDescription }: ClassExample) {
  const desktop = useMediaQuery({ minWidth: 960 })
  const [page, setPage] = useState<'class' | 'region' | 'registration' | 'correction'>('class')
  const { locale } = useLocale()
  const event = showPhotos ? classFixture : { ...classFixture, images: [] }
  const back = () => setPage('class')
  const { node: scroller, adopt } = usePublishedNode<HTMLDivElement>(setFrame)
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
      {showHostBanner && page === 'class' && (
        <div className="mx-auto min-[960px]:max-w-[1200px] min-[960px]:px-10 min-[960px]:pt-5 xl:px-12">
          <svg
            aria-label="Shri Mataji Nirmala Devi teaching Sahaja Yoga meditation"
            className={
              desktop
                ? 'block h-auto w-full overflow-hidden rounded-xl'
                : 'block h-[clamp(132px,25svh,176px)] w-full overflow-hidden sm:aspect-[4/1] sm:h-auto'
            }
            preserveAspectRatio="xMidYMin slice"
            role="img"
            viewBox={desktop ? '0 0 798 260' : '76 10 640 340'}
          >
            <image height={350} href={hostBannerPhoto} width={990} />
          </svg>
        </div>
      )}

      {scroller && (
        <div>
          <ViewHarness height="container" mode={{ standalone: false }} seedKey={locale}>
            {page === 'registration' ? (
              <ClassRegistration event={event} shareUrl={event.webUrl ?? undefined} onBack={back} />
            ) : page === 'correction' ? (
              <CorrectionPreview
                description={descriptionParagraphs(shortDescription).join('\n\n')}
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
                desktop={desktop}
                event={event}
                short={shortDescription}
                onBack={() => navigate('region')}
                onRegister={() => navigate('registration')}
                onReport={() => navigate('correction')}
              />
            )}
          </ViewHarness>
        </div>
      )}
    </div>
  )
}
