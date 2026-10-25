import type { ListingDraft } from '@/lib/proposal'
import type { Event } from '@/types'
import type { TranslationKey } from '@/types/i18next'

import { DateTime } from 'luxon'
import { Fragment, useLayoutEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Pencil } from 'lucide-react'

import { Button } from '@/components/atoms/Button'
import { Chip } from '@/components/atoms/Chip'
import { EventFacts } from '@/components/molecules/EventFacts'
import { changedSections } from '@/components/organisms/ListingEditor'
import { composeCalendarLine, useEventDisplay } from '@/hooks/use-event-display'
import { useLocale } from '@/hooks/use-locale'
import { draftTitle } from '@/lib/proposal'
import { zoneLabel } from '@/components/organisms/ListingEditor'
import { lexicalToText } from '@/lib/shape'
import { CloseButton } from '@/views/shared'

/**
 * The class's name, edited where the published class shows it. Blank, it reads as the name
 * SahajCloud will give it — the venue's street — so leaving it alone is a real choice.
 */
export function TitleField({
  draft,
  base,
  onChange,
}: {
  draft: ListingDraft
  /** The published class a correction opened as, so a renamed class can be put back. */
  base?: ListingDraft | null
  onChange: (patch: Partial<ListingDraft>) => void
}) {
  const { t } = useTranslation()
  const fallback = draftTitle({ ...draft, title: '' })
  // Grows with the name, as the published title wraps, instead of cutting a long one off.
  const field = useRef<HTMLTextAreaElement | null>(null)
  const grow = (node: HTMLTextAreaElement | null) => {
    field.current = node
    if (!node) return
    node.style.height = 'auto'
    node.style.height = `${node.scrollHeight}px`
  }

  useLayoutEffect(() => grow(field.current), [draft.title])

  return (
    <div className="min-w-0 flex-1">
      <label className="group relative block">
        <span className="sr-only">{t('submit.more.title_label')}</span>
        <textarea
          ref={grow}
          className="-mx-1.5 block w-[calc(100%+0.75rem)] resize-none overflow-hidden rounded-md border border-transparent bg-transparent py-0.5 ps-1.5 pe-8 text-lg leading-6 font-semibold tracking-wide text-foreground outline-none placeholder:font-semibold placeholder:text-gray-11 hover:border-gray-6 focus:border-primary-7 focus:bg-background focus-visible:ring-2 focus-visible:ring-focus"
          maxLength={100}
          placeholder={fallback || t('submit.chrome.title_placeholder')}
          rows={1}
          value={draft.title}
          // A name is one line: Enter finishes it rather than breaking it.
          onChange={(event) => onChange({ title: event.target.value.replace(/\n/g, ' ') })}
          onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
        />
        <Pencil
          aria-hidden
          className="pointer-events-none absolute end-1 top-1.5 text-gray-9 group-focus-within:hidden"
          size={14}
        />
      </label>
      {!draft.title.trim() && fallback && (
        <p className="mt-0.5 text-xs text-gray-11">{t('submit.chrome.title_default')}</p>
      )}
      {base && draft.title !== base.title && (
        <p className="mt-1 flex items-center gap-1">
          <span className="rounded-full bg-primary-3 px-2 py-0.5 text-xs font-semibold text-primary-11">
            {t('submit.chrome.changed')}
          </span>
          <Button
            className="h-7 px-2 text-xs"
            color="neutral"
            size="sm"
            variant="ghost"
            onClick={() => onChange({ title: base.title })}
          >
            {t('submit.chrome.undo')}
          </Button>
        </p>
      )}
    </div>
  )
}

/** The send step's and receipt's header: back to the listing, the step's name, and close. */
export function SendHeader({ title, onBack }: { title: string; onBack?: () => void }) {
  const { t } = useTranslation()

  return (
    <div className="flex shrink-0 items-center gap-1 px-2 pt-1 pb-2 md:px-4 md:pt-4">
      {onBack && (
        <Button
          isIconOnly
          aria-label={t('submit.chrome.back')}
          size="sm"
          variant="ghost"
          onClick={onBack}
        >
          <ArrowLeft size={20} />
        </Button>
      )}
      <h1 className={`min-w-0 flex-1 text-lg leading-6 font-semibold ${onBack ? '' : 'ps-2'}`}>
        {title}
      </h1>
      <CloseButton />
    </div>
  )
}

/** The listing as one compact card — what the send step sends and the receipt received. */
export function ListingCard({
  listing,
  label,
  note,
  status,
  details,
}: {
  listing: Event
  label?: string
  note?: string
  /** A chip saying the card is not yet public. */
  status?: string
  /** The draft, to list everything being sent under the facts — the send step's check. */
  details?: ListingDraft
}) {
  const { t } = useTranslation()
  const { languageLabel } = useLocale()
  const { typeLabel } = useEventDisplay(listing)

  return (
    <div className="flex flex-col gap-2">
      {label && <p className="text-sm font-semibold">{label}</p>}
      <EventFacts
        event={listing}
        title={
          <span className="flex flex-col gap-2">
            <span>{listing.title || t('submit.chrome.title_add')}</span>
            <span className="flex flex-wrap gap-1">
              {status && <Chip color="neutral">{status}</Chip>}
              {listing.schedule && <Chip color="primary">{typeLabel}</Chip>}
              {listing.languages.length > 0 && (
                <Chip color="secondary">{listing.languages.map(languageLabel).join(', ')}</Chip>
              )}
            </span>
          </span>
        }
        variant="card"
      >
        {details && <ListingExtras draft={details} listing={listing} />}
      </EventFacts>
      {note && <p className="text-xs text-gray-11">{note}</p>}
    </div>
  )
}

/** The parts the facts card does not show, so the send step's check covers every field. */
function ListingExtras({ listing, draft }: { listing: Event; draft: ListingDraft }) {
  const { t } = useTranslation()
  const rows: [string, string][] = [
    [t('submit.where.room_label'), draft.room],
    [t('submit.where.online_url_label'), listing.eventType === 'online' ? draft.onlineUrl : ''],
    [
      t('submit.review.label_contact'),
      [draft.contactName, draft.contactPhone, draft.contactEmail]
        .map((part) => part.trim())
        .filter(Boolean)
        .join(' · '),
    ],
    [t('submit.more.website_label'), draft.website],
    [t('submit.review.label_about'), draft.description],
  ]
  const shown = rows.filter(([, value]) => value.trim())

  if (shown.length === 0) return null

  return (
    <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 border-t border-divider pt-3 text-sm leading-snug">
      {shown.map(([name, value]) => (
        <Fragment key={name}>
          <dt className="text-gray-11">{name}</dt>
          <dd className="line-clamp-4 break-words whitespace-pre-line">{value.trim()}</dd>
        </Fragment>
      ))}
    </dl>
  )
}

const CHANGE_LABELS: Record<string, TranslationKey> = {
  title: 'submit.more.title_label',
  more: 'submit.more.languages_label',
  where: 'submit.review.label_where',
  when: 'submit.review.label_when',
  contact: 'submit.review.label_contact',
  about: 'submit.review.label_about',
}

/** A correction's changes, each as the class reads now and as it will read. */
export function ChangeList({
  draft,
  base,
  before,
  listing,
}: {
  draft: ListingDraft
  base: ListingDraft
  /** The published class. */
  before: Event
  /** The class with the correction applied. */
  listing: Event
}) {
  const { t } = useTranslation()
  const { languageLabel, locale } = useLocale()
  const was = useEventDisplay(before)
  const now = useEventDisplay(listing)
  const changes = changedSections(draft, base)

  const calendar = (display: typeof was) =>
    composeCalendarLine({
      recurrenceLine: display.recurrenceLine,
      whenLine: display.whenLine,
      time: display.eventTimeRange,
      hasNext: Boolean(display.display.next),
    })
  const contact = (fields: ListingDraft) =>
    [fields.contactName, fields.contactPhone, fields.contactEmail, fields.website]
      .map((line) => line.trim())
      .filter(Boolean)
      .join(' · ')
  const day = (iso: string) =>
    DateTime.fromISO(iso)
      .setLocale(locale)
      .toLocaleString({ day: 'numeric', month: 'short', year: 'numeric' })
  const until = (fields: ListingDraft) =>
    fields.repeats !== 'once' && fields.endDate
      ? t('submit.review.until', { date: day(fields.endDate) })
      : null
  const first = (fields: ListingDraft) =>
    fields.firstDate && fields.firstDate !== (fields === draft ? base : draft).firstDate
      ? t('submit.review.first', { date: day(fields.firstDate) })
      : null
  const zoneMoved = draft.timeZone !== base.timeZone
  const joined = (...parts: (string | false | null | undefined)[]) =>
    parts
      .map((part) => (part || '').trim())
      .filter(Boolean)
      .join(' · ')
  // Every leaf a section can change shows in its line, so a new room or link is never hidden
  // behind an unchanged street.
  const lines: Record<string, [string, string]> = {
    title: [before.title, draft.title.trim() || draftTitle(draft)],
    more: [
      base.languages.map(languageLabel).join(', '),
      draft.languages.map(languageLabel).join(', '),
    ],
    where: [
      joined(was.whereLine, base.address?.postCode, base.room),
      joined(now.whereLine, draft.address?.postCode, draft.room, draft.onlineUrl),
    ],
    when: [
      joined(
        calendar(was),
        first(base),
        until(base),
        zoneMoved && zoneLabel(base.timeZone, locale),
      ),
      joined(
        calendar(now),
        first(draft),
        until(draft),
        zoneMoved && zoneLabel(draft.timeZone, locale),
      ),
    ],
    contact: [contact(base), contact(draft)],
    about: [lexicalToText(before.description), draft.description.trim()],
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold">{t('submit.review.changes_label')}</p>
      {changes.length === 0 ? (
        <p className="rounded-lg bg-gray-2 p-3 text-sm text-gray-11">
          {t('submit.review.note_only')}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-divider rounded-lg border border-divider">
          {changes.map((key) => {
            const [from, to] = lines[key]

            return (
              <li key={key} className="flex flex-col gap-1 px-3 py-2.5">
                <span className="text-xs font-semibold tracking-wide text-gray-11 uppercase">
                  {t(CHANGE_LABELS[key])}
                </span>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm leading-snug">
                  <dt className="text-gray-11">{t('submit.review.was')}</dt>
                  <dd className="break-words text-gray-11">{from || '—'}</dd>
                  <dt className="font-medium">{t('submit.review.now')}</dt>
                  <dd className="font-medium break-words">
                    {to || <span className="italic">{t('submit.chrome.removed')}</span>}
                  </dd>
                </dl>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
