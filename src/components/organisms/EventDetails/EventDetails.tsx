import { type ReactNode, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarPlus, ChevronDown } from 'lucide-react'

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
import { useCoarsePointer } from '@/config/responsive'
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
}

/**
 * This is the event panel body: when and where, chips, Register, microcopy,
 * secondary actions, About, then images. The title is a separate component
 * (EventHeader). It renders outside the scrolling drawer body, so it stays pinned.
 */
/** Add-to-calendar on the class page: a text-weight control that opens a short list. It sits
 *  below the reassurance, because it isn't the next step. Only for a class with a session still
 *  to come. */
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

export function EventDetails({ event, basePath, ctaInline = true, children }: EventDetailsProps) {
  const { t } = useTranslation()
  const { display } = useEventDisplay(event)
  const ended = display.status === 'ended'
  const canDial = useCoarsePointer()

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

  if (event.contactOnly) return <ContactOnlyDetails event={event} />

  return (
    // The carousel is full-bleed and always last. It removes the container's
    // bottom padding, so the images sit flush against the end of the view
    // instead of floating 40px above it. Everything else keeps the padding.
    <div className={`flex flex-col gap-4 px-4 pt-1 ${hasImages ? '' : 'pb-10'}`}>
      {/* When and where lead, because that is what a visitor came for, and on the phone
          sheet they must fit above the sticky footer at the default height. The chips
          follow, as the quieter facts. */}
      {ended ? (
        <div className="flex flex-col gap-1">
          <p className="text-lg">{t('event.display.class_finished')}</p>
          <p className="text-base text-gray-11">{t('event.display.class_finished_body')}</p>
        </div>
      ) : (
        <>
          <EventFacts event={event} />
          <EventChips event={event} />
        </>
      )}

      {children}

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

      {/* A by-request or finished class has nothing to book, so it must not be the end of
          the road. Old posters and QR codes keep sending people to finished ones. */}
      {(ended || display.status === 'inactive') && (
        <EventOnward basePath={basePath} event={event} />
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

      {/* People have turned up to find nobody there. Worth one quiet line, only when there
          is a host to ask, and a link only where a `tel:` reaches anything. */}
      {display.next && event.contactPhone && (
        <p className="text-sm text-gray-11">
          {canDial ? (
            // A lone line of text to tap, so it gets the same 44px area as the buttons.
            <Link className="touch-target relative underline" href={`tel:${event.contactPhone}`}>
              {t('event.display.check_first_call')}
            </Link>
          ) : (
            t('event.display.check_first')
          )}
        </p>
      )}

      <WhatToExpect event={event} />

      <EventAddToCalendar event={event} />

      {/* About — host-authored prose always sits below the facts and actions. */}
      {descriptionHtml && (
        <div className="mt-4 flex flex-col gap-2">
          <h2 className="text-lg">{t('event.display.about')}</h2>
          <div
            dangerouslySetInnerHTML={{ __html: sanitizeDescription(descriptionHtml) }}
            // `colored-links` carries the host-prose treatment, wrapping included.
            className="flex flex-col gap-2 text-sm leading-snug colored-links normal-nums"
          />
        </div>
      )}

      {hasImages && (
        // This section sits full-bleed below the description. It cancels the
        // container's `px-4` padding, so the carousel spans the full drawer
        // width. The slides now carry no padding of their own.
        <div className="-mx-4">
          <ImageCarousel slides={slides} />
        </div>
      )}
    </div>
  )
}
