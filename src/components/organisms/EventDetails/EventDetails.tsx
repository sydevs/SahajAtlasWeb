import createDOMPurify from 'dompurify'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { EventActions } from './EventActions'
import { EventRegisterBar } from './EventRegister'

import { ImageCarousel } from '@/components/molecules/ImageCarousel'
import { EventFacts } from '@/components/molecules/EventFacts'
import { lexicalToHtml } from '@/lib/shape'
import { Event } from '@/types'

const DOMPurify = createDOMPurify(window)

// ADD_ATTR keeps host-authored `target` links working; force the safe rel on
// them so a `target="_blank"` in prose can never reverse-tabnab via
// window.opener (belt-and-braces — modern browsers imply noopener).
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A' && node.getAttribute('target')) {
    node.setAttribute('rel', 'noopener noreferrer')
  }
})

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

  return (
    <div className="flex flex-col gap-4 px-4 pb-10 pt-2 md:px-8">
      <EventFacts event={event} />

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
