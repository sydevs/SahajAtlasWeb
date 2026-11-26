import type { EventDisplayStrings } from '@/hooks/use-event-display'

import { type ReactNode, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { EventRegisterBar } from './EventRegister'
import { sanitizeDescription } from './sanitize'

import { Alert } from '@/components/atoms/Alert'
import { EventActions } from '@/components/molecules/EventActions'
import { EventChips } from '@/components/molecules/EventChips'
import { ImageCarousel } from '@/components/molecules/ImageCarousel'
import { EventFacts } from '@/components/molecules/EventFacts'
import { isUnverified, lexicalToHtml } from '@/lib/shape'
import { Event } from '@/types'

/**
 * Every surface in this folder takes the same three values: the event, the
 * route that reached it, and its resolved display strings. This type declares
 * them once, here. EventDetails, EventActions, and EventRegisterBar all render
 * from these. Callers always pass them together. This way, a change to the
 * contract cannot land on only two of the three.
 */
export type EventSurfaceProps = {
  event: Event
  /** The event's current route. Register and share drawers open at `${basePath}/register|share`. */
  basePath: string
  /** The view's one `useEventDisplay(event)`, shared by every surface on the page (#505). */
  strings: EventDisplayStrings
}

export type EventDetailsProps = EventSurfaceProps & {
  /** Render Register inline, above the action row. The mobile map sheet passes
   *  false and pins Register in the sticky drawer footer instead (#320). The
   *  action row stays in the panel either way. */
  registerInline?: boolean
  /**
   * This slot renders below the facts, inside the panel's own flow, above the
   * unverified caveat and Register.
   *
   * This uses a slot, not a prop, because each caller decides what goes here.
   * It is a view's job, not this component's job. The alternative was a second
   * boolean beside `registerInline` for every new addition. EventView passes
   * the post-event feedback acknowledgement (#164).
   *
   * ⚠ Register is sometimes not inline. Then the mobile map sheet pins it in
   * the sticky footer instead. This slot still renders here,
   * after the facts and above everything that follows. This position keeps it
   * above the sticky bar in reading order too.
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
  strings,
  registerInline = true,
  children,
}: EventDetailsProps) {
  const { t } = useTranslation()

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
    <div className={`flex flex-col gap-4 px-gutter pt-2 ${hasImages ? '' : 'pb-10'}`}>
      {/* The triage chips open the body. They do not sit under the title in the
          pinned header. */}
      <EventChips languages={event.languages} strings={strings} />

      {/* The facts keep extra room above the Register button. */}
      <EventFacts className="mb-2" strings={strings} />

      {children}

      {/* Above Register, not at the top of a panel that scrolls. RegistrationView
          repeats it, since that route is reachable without passing here. Badging via the
          chips above would mark the list card, the surface this leaves alone. */}
      {isUnverified(event) && (
        <Alert
          color="contrast"
          description={t('event.display.unverified_note')}
          size="sm"
          title={t('event.display.unverified_title')}
        />
      )}

      {registerInline && <EventRegisterBar basePath={basePath} event={event} strings={strings} />}
      <EventActions basePath={basePath} event={event} strings={strings} />

      {/* About — host-authored prose always sits below the facts and actions. */}
      {descriptionHtml && (
        <div className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">{t('event.display.about')}</h2>
          <div
            dangerouslySetInnerHTML={{ __html: sanitizeDescription(descriptionHtml) }}
            // `colored-links` carries the host-prose treatment, wrapping included.
            className="flex flex-col gap-2 text-sm leading-snug colored-links normal-nums"
          />
        </div>
      )}

      {hasImages && (
        // This section sits full-bleed below the description. It cancels the
        // container's `px-gutter` padding, so the carousel spans the full drawer
        // width. The slides now carry no padding of their own.
        <div className="-mx-gutter">
          <ImageCarousel slides={slides} />
        </div>
      )}
    </div>
  )
}
