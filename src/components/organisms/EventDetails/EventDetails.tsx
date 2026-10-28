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

/** A section of the panel a caller can put something at the end of. */
export type EventDetailsSection = 'details' | 'when' | 'where' | 'about'

export type EventDetailsProps = EventSurfaceProps & {
  /** Render the calls to action — Register, then the secondary action row —
   *  inline in panel order. The mobile map sheet passes false and mounts both
   *  in the sticky drawer footer instead. They travel together because the
   *  footer is pinned over the body's last band, so an inline copy of either
   *  would be drawn underneath it at the short snap (#320). */
  ctaInline?: boolean
  /**
   * This slot renders below the facts, inside the panel's own flow, above the
   * unverified caveat and Register.
   *
   * This uses a slot, not a prop, because each caller decides what goes here.
   * It is a view's job, not this component's job. The alternative was a second
   * boolean beside `ctaInline` for every new addition. EventView passes
   * the post-event feedback acknowledgement (#164).
   *
   * ⚠ The calls to action are sometimes not inline. Then the mobile map sheet
   * mounts them in the sticky footer instead. This slot still renders here,
   * after the facts and above everything that follows. This position keeps it
   * above the sticky bar in reading order too.
   */
  children?: ReactNode
  /**
   * Content at the end of a section's heading line. Given this slot, About renders even while
   * empty, so a listing still being built shows where its description goes (#147).
   */
  sectionTrailing?: (section: EventDetailsSection) => ReactNode
  /**
   * Replaces what a published class offers below the facts — the unverified caveat, Register
   * and the action row — for a listing nobody can act on yet (#147).
   */
  actions?: ReactNode
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
  ctaInline = true,
  children,
  sectionTrailing,
  actions,
}: EventDetailsProps) {
  const { t } = useTranslation()

  const descriptionHtml = useMemo(() => {
    const html = lexicalToHtml(event.description)

    return html && sanitizeDescription(html)
  }, [event.description])

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
  const detailsTrailing = sectionTrailing?.('details')

  return (
    // The carousel is full-bleed and always last. It removes the container's
    // bottom padding, so the images sit flush against the end of the view
    // instead of floating 40px above it. Everything else keeps the padding.
    <div className={`flex flex-col gap-4 px-6 pt-2 ${hasImages ? '' : 'pb-10'}`}>
      {/* The triage chips open the body. They do not sit under the title in the
          pinned header. The chips are a short row. The container's `gap-4` and
          the facts' own `my-2` add extra space before the facts. The `-mb-2`
          class removes that extra space. */}
      {detailsTrailing ? (
        <div className="-mb-2 flex items-center justify-between gap-2">
          <EventChips event={event} />
          {detailsTrailing}
        </div>
      ) : (
        <EventChips className="-mb-2" event={event} />
      )}

      {/* Extra space appears around the date and location facts, above the Register button. */}
      <EventFacts
        className="my-2"
        event={event}
        trailing={
          sectionTrailing && { when: sectionTrailing('when'), where: sectionTrailing('where') }
        }
      />

      {children}

      {actions ?? <PublishedActions basePath={basePath} ctaInline={ctaInline} event={event} />}

      {/* About — host-authored prose always sits below the facts and actions. */}
      {(descriptionHtml || sectionTrailing) && (
        <DetailsSection title={t('event.display.about')} trailing={sectionTrailing?.('about')}>
          {descriptionHtml && (
            <div
              dangerouslySetInnerHTML={{ __html: descriptionHtml }}
              // `colored-links` carries the host-prose treatment, wrapping included.
              className="flex flex-col gap-2 text-sm leading-snug colored-links normal-nums"
            />
          )}
        </DetailsSection>
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

/** What a published class offers: the unverified caveat, Register, and the action row. */
function PublishedActions({
  event,
  basePath,
  ctaInline,
}: EventSurfaceProps & { ctaInline: boolean }) {
  const { t } = useTranslation()

  return (
    <>
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

      {ctaInline && (
        <>
          <EventRegisterBar basePath={basePath} event={event} />
          <EventActions basePath={basePath} event={event} />
        </>
      )}
    </>
  )
}

/** A titled section of the panel, with whatever a caller puts at the end of its heading. */
export function DetailsSection({
  title,
  trailing,
  children,
}: {
  title: string
  trailing?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      {trailing ? (
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-md font-semibold">{title}</h2>
          {trailing}
        </div>
      ) : (
        <h2 className="text-md font-semibold">{title}</h2>
      )}
      {children}
    </div>
  )
}
