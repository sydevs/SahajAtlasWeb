import { type ReactNode, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarPlus, ChevronDown } from 'lucide-react'
import clsx from 'clsx'

import { EventOnward, EventRegisterBar } from './EventRegister'
import { sanitizeDescription } from './sanitize'

import { Alert } from '@/components/atoms/Alert'
import { Button } from '@/components/atoms/Button'
import { AddToCalendarList } from '@/components/molecules/AddToCalendar'
import { ContactOnlyDetails } from '@/components/molecules/ContactOnly'
import { EventActions } from '@/components/molecules/EventActions'
import { EventChips } from '@/components/molecules/EventChips'
import { ImageCarousel } from '@/components/molecules/ImageCarousel'
import { EventFacts } from '@/components/molecules/EventFacts'
import { WhatToExpect } from '@/components/molecules/WhatToExpect'
import { Link } from '@/components/atoms/Link'
import { useEventDisplay } from '@/hooks/use-event-display'
import { isOnline, isUnverified, lexicalToHtml } from '@/lib/shape'
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
   * Where the class sits in the atlas (country › region › city), as links, from the view. It
   * renders under the address, so every line about where reads as one group. The view passes
   * it because only views know the route; it renders nothing on a narrow panel.
   */
  placeTrail?: ReactNode
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
   * Replaces what a published class offers below the facts — the unverified caveat, Register,
   * the action row, Add to calendar and the onward offer — for a listing nobody can act on yet
   * (#147).
   */
  actions?: ReactNode
  /** What About says while there is no description yet — a listing being built (#147). */
  emptyAbout?: ReactNode
}

/**
 * This is the event panel body, in the order a visitor asks: what kind of class (the tags,
 * right under the title), when, where, then Register, the other actions and Add to calendar,
 * the host's notes, what to expect, About, then images. The title is a separate component
 * (EventHeader). It renders outside the scrolling drawer body, so it stays pinned.
 */
/** Add-to-calendar on the class page: a text-weight control that opens a short list. It closes
 *  the group of things to do with the class, after Register and the action row, as the quietest
 *  of them. Only for a class with a session still to come. */
function EventAddToCalendar({ event }: { event: Event }) {
  const { t } = useTranslation()
  const { display, whereLine } = useEventDisplay(event)
  const [open, setOpen] = useState(false)

  if (!display.next || !event.schedule) return null

  const now = Date.now()

  return (
    <div className="flex flex-col">
      <Button
        aria-expanded={open}
        className="h-11 justify-start px-0"
        color="neutral"
        variant="ghost"
        onClick={() => setOpen((value) => !value)}
      >
        <CalendarPlus className="text-primary-11" size={18} />
        {t('event.actions.add_calendar')}
        <ChevronDown className={open ? 'rotate-180 text-gray-11' : 'text-gray-11'} size={16} />
      </Button>
      {open && (
        <AddToCalendarList
          event={{
            id: event.id,
            title: event.title,
            schedule: {
              ...event.schedule,
              upcomingDates: event.schedule.upcomingDates?.filter((d) => d.getTime() > now),
            },
            location: isOnline(event) ? undefined : whereLine,
            url: event.webUrl,
            from: display.next.toJSDate(),
          }}
        />
      )}
    </div>
  )
}

export function EventDetails({
  event,
  basePath,
  ctaInline = true,
  placeTrail,
  children,
  sectionTrailing,
  actions,
  emptyAbout,
}: EventDetailsProps) {
  const { t } = useTranslation()
  const { display } = useEventDisplay(event)
  const ended = display.status === 'ended'

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

  if (event.contactOnly) return <ContactOnlyDetails event={event} />

  return (
    // The carousel is full-bleed and always last. It removes the container's
    // bottom padding, so the images sit flush against the end of the view
    // instead of floating 40px above it. Everything else keeps the padding.
    <div className={`flex flex-col gap-4 px-gutter pt-1 ${hasImages ? '' : 'pb-10'}`}>
      {/* The tags say what kind of class this is, so they sit right under its title. When and
          where follow, because that is what a visitor came for, and on the phone sheet all of
          it must fit above the sticky footer at the default height (Anton, 6 Nov). */}
      {ended ? (
        <div className="flex flex-col gap-1">
          <p className="text-lg">{t('event.display.class_finished')}</p>
          <p className="text-base text-gray-11">{t('event.display.class_finished_body')}</p>
        </div>
      ) : (
        <>
          {detailsTrailing ? (
            <div className="flex items-center justify-between gap-2">
              <EventChips event={event} />
              {detailsTrailing}
            </div>
          ) : (
            <EventChips event={event} />
          )}
          <EventFacts
            event={event}
            trailing={
              sectionTrailing && { when: sectionTrailing('when'), where: sectionTrailing('where') }
            }
          />
          {placeTrail}
        </>
      )}

      {children}

      {actions ?? (
        <PublishedActions basePath={basePath} ctaInline={ctaInline} ended={ended} event={event} />
      )}

      {/* With no phone, the Contact button already writes to this address. */}
      {event.contactEmail && event.contactPhone && (
        <p className="text-sm text-gray-11">
          {t('event.display.email_host')}{' '}
          <Link className="underline" href={`mailto:${event.contactEmail}`}>
            {event.contactEmail}
          </Link>
        </p>
      )}

      <WhatToExpect event={event} />

      {/* About — host-authored prose always sits below the facts and actions. */}
      {(descriptionHtml || sectionTrailing) && (
        <DetailsSection
          className="mt-4"
          title={t('event.display.about')}
          trailing={sectionTrailing?.('about')}
        >
          {descriptionHtml ? (
            <div
              dangerouslySetInnerHTML={{ __html: descriptionHtml }}
              // `colored-links` carries the host-prose treatment, wrapping included.
              className="flex flex-col gap-2 text-sm leading-snug colored-links normal-nums"
            />
          ) : (
            emptyAbout
          )}
        </DetailsSection>
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

/**
 * What a published class offers: the unverified caveat, Register and the action row, Add to
 * calendar, and the onward offer for a class with nothing to book.
 */
function PublishedActions({
  event,
  basePath,
  ctaInline,
  ended,
}: EventSurfaceProps & { ctaInline: boolean; ended: boolean }) {
  const { t } = useTranslation()
  const { display } = useEventDisplay(event)

  return (
    <>
      {/* Above Register, not at the top of a panel that scrolls. RegistrationView
            repeats it, since that route is reachable without passing here. Badging via the
            chips above would mark the list card, the surface this leaves alone. */}
      {isUnverified(event) && (
        <div data-sheet-fold>
          <Alert
            color="contrast"
            description={t('event.display.unverified_note')}
            size="sm"
            title={t('event.display.unverified_title')}
          />
        </div>
      )}

      {ctaInline && (
        <>
          <EventRegisterBar basePath={basePath} event={event} />
          <EventActions basePath={basePath} event={event} />
        </>
      )}

      <EventAddToCalendar event={event} />

      {/* A by-request or finished class has nothing to book, so it must not be the end of
            the road. Old posters and QR codes keep sending people to finished ones. */}
      {(ended || display.status === 'inactive') && (
        <EventOnward basePath={basePath} event={event} />
      )}
    </>
  )
}

/** A titled section of the panel, with whatever a caller puts at the end of its heading. */
export function DetailsSection({
  title,
  trailing,
  className,
  children,
}: {
  title: string
  trailing?: ReactNode
  className?: string
  children?: ReactNode
}) {
  const heading = <h2 className="text-lg">{title}</h2>

  return (
    <div className={clsx('flex flex-col gap-2', className)}>
      {trailing ? (
        <div className="flex items-center justify-between gap-2">
          {heading}
          {trailing}
        </div>
      ) : (
        heading
      )}
      {children}
    </div>
  )
}
