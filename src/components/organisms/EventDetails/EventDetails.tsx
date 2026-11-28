import type { EventDisplayStrings } from '@/hooks/use-event-display'

import { type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'

import { EventRegisterBar } from './EventRegister'
import { EventShareAndReport } from './EventShareAndReport'
import { sanitizeDescription } from './sanitize'

import { Alert } from '@/components/atoms/Alert'
import { EventActions } from '@/components/molecules/EventActions'
import { InlineAside, useInlineAside } from '@/hooks/use-inline-aside'
import { EventChips } from '@/components/molecules/EventChips'
import { ImageGallery } from '@/components/molecules/ImageGallery'
import { EventFacts } from '@/components/molecules/EventFacts'
import { QrPoster } from '@/components/molecules/QrPoster'
import { useShareUrl } from '@/hooks/use-share-url'
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
  /** The event's current route. The register drawer opens at `${basePath}/register`. */
  basePath: string
  /** The view's one `useEventDisplay(event)`, shared by every surface on the page (#505). */
  strings: EventDisplayStrings
}

export type EventDetailsProps = EventSurfaceProps & {
  /** Render Register inline, below the action row. The mobile map sheet passes
   *  false and pins Register in the sticky drawer footer instead (#320). Inline
   *  beside a map, both go under the map whatever this says. */
  registerInline?: boolean
  /**
   * This slot renders below the facts, inside the panel's own flow, above the
   * unverified caveat, the action row and Register.
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
 * This is the event panel body: chips, facts (plain text), secondary actions,
 * Register and its microcopy, About, images,
 * then the closed QR code row. The title is a separate component (EventHeader). It renders outside
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

  // The poster code is the class's own link, so a class with nothing to share has no row (#115).
  const shareUrl = useShareUrl(event.webUrl, event.path)
  // Inline beside a map, Register and the actions sit under the map, in reach while the visitor
  // reads the rest of the page.
  const aside = useInlineAside() !== null
  // There, with a page's width to read across, the facts and the description take the larger,
  // detailed treatment.
  const detailed = aside
  // Beside the map the page has room for the share targets themselves, so Share leaves the
  // action row for them, and the way to report details that are wrong follows.
  const actions = (
    <>
      <EventActions event={event} share={false} strings={strings} />
      <EventRegisterBar basePath={basePath} event={event} strings={strings} />
      <EventShareAndReport label={event.title} url={shareUrl} />
    </>
  )

  return (
    <div className={clsx('flex flex-col px-gutter pb-10', detailed ? 'gap-6' : 'gap-4 pt-2')}>
      {/* The triage chips open the body. They do not sit under the title in the
          pinned header. */}
      <EventChips languages={event.languages} strings={strings} />

      {/* The facts keep extra room above the actions; detailed, a rule closes them off. */}
      <EventFacts
        className={detailed ? 'border-b border-divider pb-8' : 'mb-2'}
        detailed={detailed}
        strings={strings}
      />

      {children}

      {/* Above the actions and Register, not at the top of a panel that scrolls. RegistrationView
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

      {aside ? (
        <InlineAside>{actions}</InlineAside>
      ) : (
        <>
          <EventActions event={event} strings={strings} />
          {registerInline && (
            <EventRegisterBar basePath={basePath} event={event} strings={strings} />
          )}
        </>
      )}

      {/* About — host-authored prose always sits below the facts and actions. */}
      {descriptionHtml && (
        <div className="flex flex-col gap-2">
          <h2 className={detailed ? 'text-xl font-semibold' : 'text-base font-semibold'}>
            {t('event.display.about')}
          </h2>
          <div
            dangerouslySetInnerHTML={{ __html: sanitizeDescription(descriptionHtml) }}
            // `colored-links` carries the host-prose treatment, wrapping included.
            className={clsx(
              'flex flex-col colored-links normal-nums',
              detailed ? 'gap-3 text-lg leading-normal' : 'gap-2 text-sm leading-snug',
            )}
          />
        </div>
      )}

      <ImageGallery images={event.images} />

      {/* For hosts printing posters, which most visitors never need, so it closes the page. */}
      {shareUrl && <QrPoster label={event.title} url={shareUrl} />}
    </div>
  )
}
