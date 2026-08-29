import { type ReactNode, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { EventRegisterBar } from './EventRegister'
import { sanitizeDescription } from './sanitize'

import { EventActions } from '@/components/molecules/EventActions'
import { EventChips } from '@/components/molecules/EventChips'
import { ImageCarousel } from '@/components/molecules/ImageCarousel'
import { EventFacts } from '@/components/molecules/EventFacts'
import { lexicalToHtml } from '@/lib/shape'
import { Event } from '@/types'

/**
 * The pair every surface in this folder takes: the event, plus the route it was
 * reached at. Declared once here (EventDetails, EventActions and EventRegisterBar
 * all render from the same two values and are always passed them together) so a
 * change to the contract can't land on only two of the three.
 */
export type EventSurfaceProps = {
  event: Event
  /** The event's current route; register/share drawers open at `${basePath}/register|share`. */
  basePath: string
}

export type EventDetailsProps = EventSurfaceProps & {
  /** Render Register inline (panel order slot 4). The mobile map sheet passes
   *  false and mounts EventRegisterBar in the sticky drawer footer instead. */
  registerInline?: boolean
  /**
   * Rendered immediately above Register, inside the panel's own flow.
   *
   * A slot rather than a prop per caller: what goes here is a view's business, not this
   * component's, and the alternative was a second boolean beside `registerInline` for every
   * such addition. EventView passes the post-event feedback acknowledgement (#164).
   *
   * ⚠ Where Register is NOT inline (the mobile map sheet mounts `EventRegisterBar` in the
   * sticky footer instead), this still renders here — after the facts, above everything that
   * follows — which keeps it above the sticky bar in reading order too.
   */
  children?: ReactNode
}

/**
 * The event panel body, in the issue #52 order: chips → facts (plain text) →
 * Register → microcopy → secondary actions → images → About. Only the title is a
 * separate component (EventHeader), rendered outside the scrolling drawer body so
 * it stays pinned; the triage chips lead the body.
 */
export function EventDetails({
  event,
  basePath,
  registerInline = true,
  children,
}: EventDetailsProps) {
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

  const hasImages = slides.length > 0

  return (
    // The carousel is full-bleed and always last, so it takes the container's
    // bottom padding away with it: the images sit flush against the end of the
    // view rather than floating 40px above it. Everything else keeps the padding.
    <div className={`flex flex-col gap-4 px-6 pt-2 ${hasImages ? '' : 'pb-10'}`}>
      {/* The triage chips open the body rather than riding under the title in the
          pinned header. `-mb-2` pulls the facts back up: the chips are a short row
          and the container's `gap-4` plus the facts' own `my-2` left them floating. */}
      <EventChips className="-mb-2" event={event} />

      {/* Extra breathing room around the when/where facts, above the register CTA. */}
      <EventFacts className="my-2" event={event} />

      {children}

      {registerInline && <EventRegisterBar basePath={basePath} event={event} />}

      <EventActions basePath={basePath} event={event} />

      {/* About — host-authored prose sits BELOW facts and actions, always. */}
      {descriptionHtml && (
        <div className="flex flex-col gap-2">
          <h2 className="text-md font-semibold">{t('display.about')}</h2>
          <div
            dangerouslySetInnerHTML={{ __html: sanitizeDescription(descriptionHtml) }}
            // `colored-links` carries the host-prose treatment, wrapping included.
            className="colored-links flex flex-col gap-2 text-sm normal-nums leading-snug"
          />
        </div>
      )}

      {hasImages && (
        // Full-bleed below the description: cancel the container's px-6 so the
        // carousel spans the full drawer width (the slides carry no padding now).
        <div className="-mx-6">
          <ImageCarousel slides={slides} />
        </div>
      )}
    </div>
  )
}
