import type { ListingSection } from '@/lib/proposal'

import { type ReactNode, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { EventRegisterBar } from './EventRegister'
import { sanitizeDescription } from './sanitize'

import { Alert } from '@/components/atoms/Alert'
import { Button } from '@/components/atoms/Button'
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

export type EventDetailsProps = EventSurfaceProps & {
  /** Render Register inline (panel order slot 4). The mobile map sheet passes
   *  false and mounts EventRegisterBar in the sticky drawer footer instead. */
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
   * ⚠ Register is sometimes not inline. Then the mobile map sheet mounts
   * `EventRegisterBar` in the sticky footer instead. This slot still renders
   * here, after the facts and above everything that follows. This position
   * keeps it above the sticky bar in reading order too.
   */
  children?: ReactNode
  /**
   * Renders a listing that does not exist yet — the add-a-class and correction flows build it
   * live from what the visitor enters (#147). Nothing on it can be acted on, so Register, the
   * action row and the unverified caveat drop, and the contact details show as plain lines.
   * `onEdit`, passed on the review step, puts an Edit link on each section.
   */
  preview?: { onEdit?: (section: ListingSection) => void }
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
  preview,
}: EventDetailsProps) {
  const { t } = useTranslation()
  const onEdit = preview?.onEdit
  // One Edit control per section. Every one reads "Edit", so each carries the section it
  // returns to in its accessible name.
  const edit = (section: ListingSection, name: string) =>
    onEdit && (
      <Button
        aria-label={`${t('submit.review.edit')}: ${name}`}
        className="-my-1 shrink-0"
        color="primary"
        size="sm"
        variant="ghost"
        onClick={() => onEdit(section)}
      >
        {t('submit.review.edit')}
      </Button>
    )

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
      <div className="-mb-2 flex items-center justify-between gap-2">
        <EventChips event={event} />
        {edit('more', t('submit.more.title'))}
      </div>

      {/* Extra space appears around the date and location facts, above the Register button. */}
      <EventFacts
        className="my-2"
        event={event}
        trailing={
          onEdit && {
            when: edit('when', t('submit.when.title')),
            where: edit('where', t('submit.where.title')),
          }
        }
      />

      {children}

      {preview ? (
        <PreviewSection
          edit={edit('contact', t('submit.contact.title'))}
          title={t('submit.contact.title')}
        >
          {[event.contactName, event.contactPhone].filter(Boolean).map((line) => (
            <p key={line}>{line}</p>
          ))}
        </PreviewSection>
      ) : (
        <PublishedSections basePath={basePath} event={event} registerInline={registerInline} />
      )}

      {/* About — host-authored prose always sits below the facts and actions. */}
      {preview ? (
        <PreviewSection
          edit={edit('about', t('event.display.about'))}
          title={t('event.display.about')}
        >
          {descriptionHtml && (
            <div
              dangerouslySetInnerHTML={{ __html: sanitizeDescription(descriptionHtml) }}
              className="flex flex-col gap-2 colored-links normal-nums"
            />
          )}
        </PreviewSection>
      ) : (
        descriptionHtml && (
          <div className="flex flex-col gap-2">
            <h2 className="text-md font-semibold">{t('event.display.about')}</h2>
            <div
              dangerouslySetInnerHTML={{ __html: sanitizeDescription(descriptionHtml) }}
              // `colored-links` carries the host-prose treatment, wrapping included.
              className="flex flex-col gap-2 text-sm leading-snug colored-links normal-nums"
            />
          </div>
        )
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
function PublishedSections({
  event,
  basePath,
  registerInline,
}: EventSurfaceProps & { registerInline: boolean }) {
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

      {registerInline && <EventRegisterBar basePath={basePath} event={event} />}

      <EventActions basePath={basePath} event={event} />
    </>
  )
}

/** A preview section: its heading, its Edit link on review, and whatever it holds so far. */
function PreviewSection({
  title,
  edit,
  children,
}: {
  title: string
  edit?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2 text-sm leading-snug">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-md font-semibold">{title}</h2>
        {edit}
      </div>
      {children}
    </div>
  )
}
