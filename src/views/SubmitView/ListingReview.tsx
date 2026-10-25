import type { ListingDraft, ListingSection } from '@/lib/proposal'
import type { Question } from '@/lib/questions'
import type { Event } from '@/types'
import type { ReactNode } from 'react'

import { useTranslation } from 'react-i18next'
import { DateTime } from 'luxon'
import { ArrowRight, CalendarDays } from 'lucide-react'

import { ListingDetails } from './ListingDetails'

import { Button } from '@/components/atoms/Button'
import { composeCalendarLine, useEventDisplay } from '@/hooks/use-event-display'
import { useLocale } from '@/hooks/use-locale'
import { stepChanged } from '@/lib/proposal'
import { SECTION_QUESTION } from '@/lib/questions'

/** The schedule as the listing will read it, under the time picks. */
export function ScheduleSummary({ listing }: { listing: Event }) {
  const { recurrenceLine, whenLine, eventTimeRange, display } = useEventDisplay(listing)

  if (!display.next) return null

  const line = composeCalendarLine({
    recurrenceLine,
    whenLine,
    time: eventTimeRange,
    hasNext: true,
  })

  return (
    <div className="flex items-start gap-3 rounded-xl bg-primary-2 px-4 py-3" role="status">
      <CalendarDays aria-hidden className="mt-0.5 size-5 shrink-0 text-primary-11" />
      <p className="min-w-0 text-[15px] leading-snug font-medium">{line}</p>
    </div>
  )
}

/** A new listing as it will appear, framed as a preview, with an Edit link on each section. */
export function ListingPreview({
  listing,
  path,
  onEdit,
}: {
  listing: Event
  path: string
  onEdit: (question: Question) => void
}) {
  const { t } = useTranslation()

  return (
    <div className="overflow-hidden rounded-xl border border-gray-6 bg-background shadow-sm">
      <p className="border-b border-gray-4 bg-gray-2 px-6 py-2 text-xs font-semibold tracking-wide text-gray-11 uppercase">
        {t('submit.ask.preview_eyebrow')}
      </p>
      <div className="flex items-start justify-between gap-2 px-6 pt-4">
        <h4 className="text-lg leading-6 font-semibold">{listing.title}</h4>
        <Button
          aria-label={`${t('submit.review.edit')}: ${t('submit.ask.name_label')}`}
          className="-my-1 shrink-0"
          color="primary"
          size="sm"
          variant="ghost"
          onClick={() => onEdit('about')}
        >
          {t('submit.review.edit')}
        </Button>
      </div>
      {/* The panel's own bottom padding is sized for a drawer's end, not a card's. */}
      <div className="[&>div]:!pb-5">
        <ListingDetails
          listing={listing}
          path={path}
          onEdit={(section: ListingSection) => onEdit(SECTION_QUESTION[section])}
        />
      </div>
    </div>
  )
}

/** One changed fact: what the listing says now, and what the correction makes it. */
function ChangeRow({
  label,
  was,
  now,
  onEdit,
}: {
  label: string
  was: ReactNode
  now: ReactNode
  onEdit?: () => void
}) {
  const { t } = useTranslation()

  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{label}</p>
        {onEdit && (
          <Button
            aria-label={`${t('submit.review.edit')}: ${label}`}
            className="-my-1 -me-2"
            color="primary"
            size="sm"
            variant="ghost"
            onClick={onEdit}
          >
            {t('submit.review.edit')}
          </Button>
        )}
      </div>
      <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1 text-[15px] leading-snug">
        <dt className="text-xs font-medium tracking-wide text-gray-11 uppercase">
          {t('submit.correct.was')}
        </dt>
        <dd className="text-gray-11 line-through decoration-gray-8">{was || '—'}</dd>
        <dt className="text-xs font-medium tracking-wide text-primary-11 uppercase">
          {t('submit.correct.now')}
        </dt>
        <dd className="flex items-baseline gap-1.5 font-medium">
          <ArrowRight aria-hidden className="size-3.5 shrink-0 translate-y-0.5 text-primary-11" />
          <span className="min-w-0 break-words">{now || '—'}</span>
        </dd>
      </dl>
    </li>
  )
}

const contactLine = (draft: ListingDraft) =>
  [draft.contactName, draft.contactPhone, draft.contactEmail].filter(Boolean).join(' · ')

/**
 * What a correction sends, as "was → now" for each fact it changes — so the visitor sees exactly
 * what a coordinator will be asked to change, and nothing they did not touch.
 */
export function CorrectionChanges({
  event,
  listing,
  base,
  draft,
  stopped,
  note,
  onEdit,
}: {
  /** The published class. */
  event: Event
  /** The class as the correction would leave it. */
  listing: Event
  base: ListingDraft
  draft: ListingDraft
  stopped: boolean
  /** The note to the coordinator, which is a correction of its own when nothing else changed. */
  note: string
  onEdit: (question: Question) => void
}) {
  const { t } = useTranslation()
  const { locale, languageLabel } = useLocale()
  const before = useEventDisplay(event)
  const after = useEventDisplay(listing)
  const calendar = (display: typeof before) =>
    composeCalendarLine({
      recurrenceLine: display.recurrenceLine,
      whenLine: display.whenLine,
      time: display.eventTimeRange,
      hasNext: Boolean(display.display.next),
    })
  const rows: ReactNode[] = []

  if (stopped) {
    const last = DateTime.fromISO(draft.endDate)

    rows.push(
      <ChangeRow
        key="stopped"
        label={t('submit.correct.reason_stopped')}
        now={
          draft.endDate && draft.endDate !== base.endDate && last.isValid
            ? `${t('submit.correct.stopped_change')} · ${t('submit.correct.stopped_change_on', {
                date: last.setLocale(locale).toLocaleString(DateTime.DATE_MED),
              })}`
            : t('submit.correct.stopped_change')
        }
        was={calendar(before)}
        onEdit={() => onEdit('stopped')}
      />,
    )
  }

  // A stopped class's last date is the stopped row above; any other schedule change still shows.
  const scheduleChanged = stopped
    ? stepChanged('when', { ...draft, endDate: base.endDate }, base)
    : stepChanged('when', draft, base)

  if (scheduleChanged) {
    rows.push(
      <ChangeRow
        key="when"
        label={t('submit.when.title')}
        now={calendar(after)}
        was={calendar(before)}
        onEdit={() => onEdit('often')}
      />,
    )
  }
  if (stepChanged('where', draft, base)) {
    rows.push(
      <ChangeRow
        key="where"
        label={t('submit.where.title')}
        now={after.whereLine}
        was={before.whereLine}
        onEdit={() => onEdit('place')}
      />,
    )
  }
  if (stepChanged('contact', draft, base)) {
    rows.push(
      <ChangeRow
        key="contact"
        label={t('submit.contact.title')}
        now={contactLine(draft)}
        was={contactLine(base)}
        onEdit={() => onEdit('contact')}
      />,
    )
  }
  if (stepChanged('about', draft, base)) {
    rows.push(
      <ChangeRow
        key="about"
        label={t('event.display.about')}
        now={draft.description}
        was={base.description}
        onEdit={() => onEdit('about')}
      />,
    )
  }
  if (stepChanged('more', draft, base)) {
    rows.push(
      <ChangeRow
        key="more"
        label={t('submit.more.title')}
        now={[draft.title, draft.languages.map(languageLabel).join(', '), draft.website]
          .filter(Boolean)
          .join(' · ')}
        was={[base.title, base.languages.map(languageLabel).join(', '), base.website]
          .filter(Boolean)
          .join(' · ')}
      />,
    )
  }

  if (rows.length === 0 && note.trim()) {
    return (
      <div className="flex flex-col gap-1.5 rounded-xl border border-gray-6 px-4 py-3">
        <p className="text-sm font-semibold">{t('submit.correct.note_row')}</p>
        <p className="text-[15px] leading-snug break-words whitespace-pre-line">{note}</p>
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-xl bg-gray-2 px-4 py-3 text-[15px] leading-snug text-gray-11">
        {t('submit.correct.nothing_changed')}
      </p>
    )
  }

  return (
    <ul className="divide-y divide-gray-4 overflow-hidden rounded-xl border border-gray-6">
      {rows}
    </ul>
  )
}
