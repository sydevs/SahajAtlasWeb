import createDOMPurify from 'dompurify'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { EventActions } from './EventActions'
import { EventRegisterBar } from './EventRegister'

import { ImageCarousel } from '@/components/molecules/ImageCarousel'
import { CalendarIcon, LocationIcon } from '@/components/atoms/Icons'
import { useEventDisplay } from '@/hooks/use-event-display'
import { useMapController } from '@/hooks/use-map-controller'
import { lexicalToHtml } from '@/lib/shape'
import { Event } from '@/types'

const DOMPurify = createDOMPurify(window)

// One plain-text fact line with its icon-set icon. Facts are never actions:
// nothing here looks like a button or navigates (issue #52 design grammar).
function FactLine({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 shrink-0 text-primary">{icon}</span>
      <div className="min-w-0 text-sm leading-snug">{children}</div>
    </div>
  )
}

export type EventDetailsProps = {
  event: Event
  /** The event's current route; register/share drawers open at `${basePath}/register|share`. */
  basePath: string
  /** Render Register inline (panel order slot 4). The mobile map sheet passes
   *  false and mounts EventRegisterBar in the sticky drawer footer instead. */
  registerInline?: boolean
}

/**
 * The event panel body, in the issue #52 order: facts (plain text) → Register →
 * microcopy → secondary actions → images → About. The title/chip header is a
 * separate component (EventHeader) rendered outside the scrolling drawer body,
 * so the peek/pinned header always carries the triage payload.
 */
export function EventDetails({ event, basePath, registerInline = true }: EventDetailsProps) {
  const { t } = useTranslation('events')
  const { frameEvent } = useMapController()
  const { display, recurrenceLine, whenLine, timeLine, originNote, whereLine } =
    useEventDisplay(event)

  const descriptionHtml = lexicalToHtml(event.description)

  // The image alt doubles as the lightbox caption. Memoized so a stable slides
  // array is threaded to the carousel/lightbox across re-renders. URLs are
  // already origin-resolved by getEvent; skip any image that has none.
  const slides = useMemo(
    () =>
      event.images.flatMap((image) =>
        image.url
          ? [{ src: image.url, alt: image.alt ?? undefined, caption: image.alt ?? undefined }]
          : [],
      ),
    [event.images],
  )

  // The authoritative session line: "Next session: Wed, 22 Jul · 19:30 – 20:45
  // (your time) · 19:30 (Prague)". Terminal states carry their message instead.
  const sessionLine = [whenLine, timeLine, originNote].filter(Boolean).join(' · ')

  return (
    <div className="flex flex-col gap-4 px-4 pb-10 pt-2 md:px-8">
      {/* Facts — plain text, icon-set icons, non-navigating. */}
      <div className="flex flex-col gap-2.5">
        <FactLine icon={<CalendarIcon size={20} />}>
          {recurrenceLine && <div className="text-gray-11">{recurrenceLine}</div>}
          <div className="font-medium">{sessionLine}</div>
        </FactLine>
        {whereLine && (
          <FactLine icon={<LocationIcon size={20} />}>
            {display.online ? (
              <div className="font-medium">{whereLine}</div>
            ) : (
              // Tapping the address MAY re-centre the map pin, but never leaves
              // the panel — styled as plain text, not a link.
              <button
                className="text-start font-medium text-foreground"
                type="button"
                onClick={() => frameEvent(event)}
              >
                {whereLine}
              </button>
            )}
          </FactLine>
        )}
      </div>

      {registerInline && <EventRegisterBar basePath={basePath} event={event} />}

      <EventActions basePath={basePath} event={event} />

      {slides.length > 0 && (
        <div className="flex w-full items-center justify-center">
          <ImageCarousel slides={slides} />
        </div>
      )}

      {/* About — host-authored prose sits BELOW facts and actions, always. */}
      {descriptionHtml && (
        <div className="flex flex-col gap-2">
          <h2 className="text-md font-semibold">{t('display.about')}</h2>
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
            className="colored-links normal-nums flex flex-col gap-2 text-sm leading-snug"
          />
        </div>
      )}
    </div>
  )
}
