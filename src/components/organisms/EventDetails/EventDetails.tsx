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
 * Every surface in this folder takes the same pair: the event, and the route
 * that reached it. This type declares the pair once, here. EventDetails,
 * EventActions, and EventRegisterBar all render from these same two values.
 * Callers always pass both together. This way, a change to the contract
 * cannot land on only two of the three.
 */
export type EventSurfaceProps = {
  event: Event
  /** The event's current route. Register and share drawers open at `${basePath}/register|share`. */
  basePath: string
}

export type EventDetailsProps = EventSurfaceProps & {
  /** Render Register inline (panel order slot 4). The mobile map sheet passes
   *  false and mounts EventRegisterBar in the sticky drawer footer instead. */
  registerInline?: boolean
  /**
   * This slot renders immediately above Register, inside the panel's own flow.
   *
   * This uses a slot, not a prop, because each caller decides what goes here.
   * It is a view's job, not this component's job. The alternative was a second
   * boolean beside `registerInline` for every new addition. EventView passes
   * the post-event feedback acknowledgement (#164).
   *
   * ⚠ Register is sometimes not inline. Then the mobile map sheet mounts
   * `EventRegisterBar` in the sticky footer instead. This slot still renders
   * here, after the facts and above everything that follows. This position
   * keeps it above the sticky bar in reading order too.
   */
  children?: ReactNode
}

/**
 * This is the event panel body. It follows the order from issue #52: chips,
 * facts (plain text), Register, microcopy, secondary actions, images, then
 * About. The title is a separate component (EventHeader). It renders outside
 * the scrolling drawer body, so it stays pinned. The triage chips lead the body.
 */
export function EventDetails({
  event,
  basePath,
  registerInline = true,
  children,
}: EventDetailsProps) {
  const { t } = useTranslation('events')

  const descriptionHtml = lexicalToHtml(event.description)

  // The image alt text doubles as the lightbox caption. This value is memoized,
  // so the carousel and lightbox receive the same stable slides array across
  // re-renders. getEvent already resolves each URL to its origin. Skip any
  // image with no URL.
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
    // The carousel is full-bleed and always last. It removes the container's
    // bottom padding, so the images sit flush against the end of the view
    // instead of floating 40px above it. Everything else keeps the padding.
    <div className={`flex flex-col gap-4 px-6 pt-2 ${hasImages ? '' : 'pb-10'}`}>
      {/* The triage chips open the body. They do not sit under the title in the
          pinned header. The chips are a short row. The container's `gap-4` and
          the facts' own `my-2` add extra space before the facts. The `-mb-2`
          class removes that extra space. */}
      <EventChips className="-mb-2" event={event} />

      {/* Extra space appears around the date and location facts, above the Register button. */}
      <EventFacts className="my-2" event={event} />

      {children}

      {registerInline && <EventRegisterBar basePath={basePath} event={event} />}

      <EventActions basePath={basePath} event={event} />

      {/* About — host-authored prose always sits below the facts and actions. */}
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
        // This section sits full-bleed below the description. It cancels the
        // container's `px-6` padding, so the carousel spans the full drawer
        // width. The slides now carry no padding of their own.
        <div className="-mx-6">
          <ImageCarousel slides={slides} />
        </div>
      )}
    </div>
  )
}
