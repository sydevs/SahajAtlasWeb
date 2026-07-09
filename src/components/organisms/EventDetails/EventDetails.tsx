import { useNavigate } from 'react-router'
import createDOMPurify from 'dompurify'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { EventContactDetails, EventTimingDetails, EventLocationDetails } from './details'

import { EventSoonChip } from '@/components/molecules/EventSoon'
import { ImageCarousel } from '@/components/molecules/ImageCarousel'
import { Button } from '@/components/atoms/Button'
import { AnchorIcon } from '@/components/atoms/Icons'
import { useLocale } from '@/hooks/use-locale'
import { isOnline, lexicalToHtml, nextOccurrence } from '@/lib/shape'
import { Event } from '@/types'
import { Chip } from '@/components/atoms/Chip'

const DOMPurify = createDOMPurify(window)

// The registration call-to-action. External events link straight out; native
// events (with at least one upcoming date) open the RegistrationView drawer at
// `${basePath}/register` — registration is a routed drawer now, not a modal.
function RegisterAction({
  event,
  basePath,
  className,
}: {
  event: Event
  basePath: string
  className?: string
}) {
  const { t } = useTranslation('events')
  const navigate = useNavigate()

  if (event.registrationMode === 'external') {
    if (!event.externalRegistrationUrl) return null

    return (
      <Button
        className={className}
        color="primary"
        href={event.externalRegistrationUrl}
        rel="noopener noreferrer"
        target="_blank"
        variant="flat"
      >
        <span className="font-semibold tracking-wider">{t('registration.register_now')}</span>
        <AnchorIcon className="text-primary" />
      </Button>
    )
  }

  const upcomingDates = event.schedule?.upcomingDates ?? []

  if (upcomingDates.length === 0) return null

  return (
    <Button
      className={className}
      color="primary"
      variant="flat"
      onClick={() => navigate(`${basePath}/register`)}
    >
      <span className="font-semibold tracking-wider">{t('registration.register_now')}</span>
    </Button>
  )
}

// The share call-to-action: opens the ShareView drawer at `${basePath}/share`.
function ShareAction({ basePath, className }: { basePath: string; className?: string }) {
  const { t } = useTranslation('events')
  const navigate = useNavigate()

  return (
    <Button
      className={className}
      color="primary"
      variant="faded"
      onClick={() => navigate(`${basePath}/share`)}
    >
      <span className="font-semibold tracking-wider">{t('details.share')}</span>
    </Button>
  )
}

export type EventDetailsProps = {
  event: Event
  /** The event's current route; register/share drawers open at `${basePath}/register|share`. */
  basePath: string
}

// The reusable event content body — carousel, description, and the
// timing/contact/location cards — rendered inside the EventView drawer (the
// drawer supplies the chrome). Register/share are routed drawers, reached via the
// CTAs here.
export function EventDetails({ event, basePath }: EventDetailsProps) {
  const { t } = useTranslation('events')
  const { locale, languageNames } = useLocale()

  const online = isOnline(event)
  const languageCode = event.languages[0] ?? ''
  const next = nextOccurrence(event)
  const descriptionHtml = lexicalToHtml(event.description)

  // The image alt doubles as the lightbox caption (today's behavior). Memoized so
  // a stable slides array is threaded to the carousel/lightbox across re-renders.
  // URLs are already origin-resolved by getEvent; skip any image that has none.
  const slides = useMemo(
    () =>
      event.images.flatMap((image) =>
        image.url
          ? [
              {
                src: image.url,
                alt: image.alt ?? undefined,
                caption: image.alt ?? undefined,
              },
            ]
          : [],
      ),
    [event.images],
  )

  return (
    <>
      <div className="flex w-full items-center justify-center">
        <ImageCarousel slides={slides} />
      </div>
      <div className="flex flex-col gap-3 px-8 pb-12 pt-3">
        <h1
          className={`
          text-[24px] font-semibold leading-7 tracking-wide
          ${slides.length > 0 ? '' : 'mt-3'}
        `}
        >
          {event.title}
        </h1>
        <div className="flex gap-1">
          {next && <EventSoonChip firstDate={next} online={online} />}
          {online && <Chip>{t('details.online')}</Chip>}
          {languageCode && languageCode.split('-')[0] !== locale.split('-')[0] && (
            <Chip color="secondary">{languageNames.of(languageCode)}</Chip>
          )}
        </div>
        {descriptionHtml && (
          <div
            dangerouslySetInnerHTML={{
              __html: DOMPurify.sanitize(descriptionHtml, {
                USE_PROFILES: { html: true },
                ALLOWED_TAGS: [
                  'p',
                  'b',
                  'i',
                  'em',
                  'strong',
                  'a',
                  'ul',
                  'ol',
                  'li',
                  'del',
                  'br',
                  'h3',
                ],
                ALLOWED_ATTR: ['href'],
                ADD_ATTR: ['target'],
              }),
            }}
            className="colored-links normal-nums my-2 flex flex-col gap-2 leading-snug"
          />
        )}
        <div className="flex-center-x gap-1">
          <RegisterAction basePath={basePath} className="flex-grow-[3]" event={event} />
          <ShareAction basePath={basePath} className="flex-grow" />
        </div>
        {/* The host-contact card's position and emphasis depend on whether the
            event has an upcoming occurrence, so this owns the ordering:
            contact-highlighted-first when there's no upcoming date, else
            timing → location → contact. */}
        <div className="mt-5 flex flex-col gap-4">
          {!next && <EventContactDetails isHighlighted event={event} />}

          {next && <EventTimingDetails convertTimeZone={online} event={event} />}

          <EventLocationDetails event={event} />

          {next && <EventContactDetails event={event} />}
        </div>
      </div>
    </>
  )
}
