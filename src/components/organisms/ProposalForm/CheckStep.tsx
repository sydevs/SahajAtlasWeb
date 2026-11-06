import type { FixIntent, ListingDraft, ListingSection, ListingSender } from '@/lib/proposal'
import type { Event } from '@/types'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode, RefObject } from 'react'

import { DateTime } from 'luxon'
import { useTranslation } from 'react-i18next'
import {
  AlignLeft,
  CalendarDays,
  ChevronDown,
  Globe,
  MapPin,
  Monitor,
  RotateCcw,
  UserRound,
} from 'lucide-react'

import { FIELD_TEXT, GroupHeading, StepHeading, ValidatedInput } from './fields'
import { type SummaryRow, useAutoTitle, useScheduleLines, useSummaryRows } from './summary'

import { Alert } from '@/components/atoms/Alert'
import { Button } from '@/components/atoms/Button'
import { Textarea } from '@/components/atoms/Textarea'
import { EventChips } from '@/components/molecules/EventChips'
import { FormField } from '@/components/molecules/FormField'
import { userSubmissionValueMax } from '@/config/api/mutate'
import { useLocale } from '@/hooks/use-locale'

/** What a change on a correction's Check can be: a row of the listing, the report, or the note. */
export type ChangeKey = SummaryRow['key'] | 'stopped' | 'nobody' | 'note'

export type CheckStepProps = {
  sender: ListingSender
  onSender: (patch: Partial<ListingSender>) => void
  emailError: boolean
  /** The listing preview, with an Edit link per section — the view builds it. */
  preview?: ReactNode
  /** A correction: what it opened as, and the published class, for the was → now list. */
  correction?: {
    baseDraft: ListingDraft
    event?: Event
    intent: FixIntent | null
    reported: boolean
    nobodyOn: string | null
  }
  draft: ListingDraft
  listing?: Event
  onEdit: (section: ListingSection | 'note') => void
  /** A correction reopens one of its reports, whichever was written last. */
  onEditReport?: (report: 'stopped' | 'nobody') => void
  /** A correction takes back one change; `remaining` is how many are left after it. */
  onUndo?: (key: ChangeKey, remaining: number) => void
  /** A correction goes back to "what needs fixing?" to add another change to the same report. */
  onMore?: () => void
  challengeRef: RefObject<HTMLDivElement> | ((node: HTMLDivElement | null) => void)
  /** The challenge could not run, so Send cannot either — said, not left as a dead button. */
  challengeBlocked: boolean
  /** An address is given and the challenge has not answered, so Send waits: said, not left dead. */
  challengeWaiting: boolean
  /** A correction that only reports nobody there, so nothing on the listing would change. */
  reportOnly: boolean
  noChanges: boolean
  refusal?: string | false
}

/**
 * The last step: what will be sent, then the visitor. A new listing reads back as the listing
 * itself, in the order the published class shows it; a correction reads back only what changes,
 * each as Was / Now with its own Undo. Then the visitor's private address, and Send.
 */
export function CheckStep({
  sender,
  onSender,
  emailError,
  preview,
  correction,
  draft,
  listing,
  onEdit,
  onEditReport,
  onUndo,
  onMore,
  challengeRef,
  challengeBlocked,
  challengeWaiting,
  reportOnly,
  noChanges,
  refusal,
}: CheckStepProps) {
  const { t } = useTranslation()
  // A report with no field to change already wrote its note on the step before.
  const noteWritten =
    Boolean(correction?.reported) ||
    (correction?.nobodyOn ?? null) !== null ||
    correction?.intent === 'other'

  return (
    <div className="flex flex-col gap-6">
      {correction ? (
        <>
          <StepHeading
            intro={t(reportOnly ? 'submit.changes.intro_report' : 'submit.changes.intro')}
            title={t(reportOnly ? 'submit.changes.title_report' : 'submit.changes.title')}
          />
          {correction.event && listing && (
            <ChangeList
              base={correction.event}
              baseDraft={correction.baseDraft}
              draft={draft}
              listing={listing}
              nobodyOn={correction.nobodyOn}
              note={noteWritten ? sender.note : ''}
              reported={correction.reported}
              onEdit={onEdit}
              onEditReport={onEditReport}
              onMore={onMore}
              onUndo={onUndo}
            />
          )}
          {preview && (
            // Full-bleed, so the listing lines up with the form around it exactly as it will
            // line up in its own panel — a card inside the sheet would indent it twice.
            <details className="group -mx-gutter border-y border-gray-5">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-gutter text-sm font-medium [&::-webkit-details-marker]:hidden">
                {t('submit.changes.full_listing')}
                <ChevronDown
                  aria-hidden
                  className="text-gray-11 transition-transform group-open:rotate-180"
                  size={18}
                />
              </summary>
              <div className="border-t border-gray-5 bg-gray-2 pt-4">{preview}</div>
            </details>
          )}
        </>
      ) : (
        <>
          <StepHeading intro={t('submit.review.intro')} title={t('submit.review.title')} />
          {listing && <ListingSummary draft={draft} listing={listing} onEdit={onEdit} />}
        </>
      )}

      <section className="flex flex-col gap-3">
        <GroupHeading
          help={t('submit.review.email_help_private')}
          title={t('submit.review.you_title')}
        />
        <ValidatedInput
          required
          autoComplete="email"
          error={emailError && t('submit.errors.email')}
          id="submit-sender-email"
          inputMode="email"
          label={t('submit.review.email_private')}
          type="email"
          value={sender.email}
          onChange={(event) => onSender({ email: event.target.value })}
        />
        {!noteWritten && (
          <FormField htmlFor="submit-note" label={t('submit.review.note_label')}>
            <Textarea
              className={FIELD_TEXT}
              id="submit-note"
              maxLength={userSubmissionValueMax('note')}
              rows={2}
              value={sender.note}
              onChange={(event) => onSender({ note: event.target.value })}
            />
          </FormField>
        )}
      </section>

      <div ref={challengeRef} className="empty:hidden" />
      {challengeWaiting && (
        <p className="text-sm text-gray-11" role="status">
          {t('submit.review.checking')}
        </p>
      )}
      {challengeBlocked && (
        <Alert color="danger" description={t('submit.errors.captcha')} role="alert" size="sm" />
      )}
      {noChanges && <Alert color="neutral" description={t('submit.review.no_changes')} size="sm" />}
      {refusal && <Alert color="danger" description={refusal} role="alert" size="sm" />}
    </div>
  )
}

/**
 * A new listing read back as the listing it will be: name, chips, when, where, then whatever
 * optional parts were filled in. The facts a host can get wrong without noticing — the first
 * date, the zone, the full address and room, the join link — are spelled out, not implied.
 * Optional parts left empty are named once at the foot instead of each saying "Not given".
 */
function ListingSummary({
  draft,
  listing,
  onEdit,
}: {
  draft: ListingDraft
  listing: Event
  onEdit: (section: ListingSection) => void
}) {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const schedule = useScheduleLines(draft, listing)
  const autoTitle = useAutoTitle(draft)
  const online = draft.eventType === 'online'
  const place = online ? draft.city : draft.address
  const contact = [draft.contactName, draft.contactPhone, draft.contactEmail]
    .map((line) => line.trim())
    .filter(Boolean)
  const description = draft.description.trim()
  const website = draft.website.trim()
  const leftOut = [
    contact.length === 0 && t('submit.summary.contact'),
    !description && t('submit.about.description_label'),
    !website && t('submit.more.website_label'),
  ].filter((part): part is string => Boolean(part))

  return (
    <article className="flex flex-col rounded-lg border border-gray-6">
      <div className="flex flex-col gap-3 px-gutter pt-4 pb-3">
        <div className="flex items-start justify-between gap-2">
          <h4 className="min-w-0 text-base leading-snug font-semibold text-balance">
            {draft.title.trim() || autoTitle || t('submit.chrome.title_add')}
          </h4>
          <EditButton label={t('submit.more.title_label')} onClick={() => onEdit('details')} />
        </div>
        <EventChips event={listing} />
      </div>

      <Fact icon={CalendarDays} label={t('submit.chrome.step_when')} onEdit={() => onEdit('when')}>
        {schedule ? (
          <>
            <p className="font-medium">{schedule.pattern}</p>
            <p>{[schedule.time, schedule.zone].filter(Boolean).join(' · ')}</p>
            {draft.repeats !== 'once' && (
              <p className="text-gray-11">
                {draft.endDate
                  ? `${t('submit.when.last_class')}: ${longDate(draft.endDate, locale)}`
                  : t('submit.summary.no_end')}
              </p>
            )}
          </>
        ) : (
          <p className="text-gray-11">{t('submit.when.summary_empty')}</p>
        )}
      </Fact>

      <Fact
        icon={online ? Monitor : MapPin}
        label={t('submit.chrome.step_where')}
        onEdit={() => onEdit('where')}
      >
        {online ? (
          <>
            <p className="font-medium">
              {t('submit.review.online_line', { city: place?.city ?? place?.label ?? '' })}
            </p>
            {draft.onlineUrl.trim() && <p className="break-all">{draft.onlineUrl.trim()}</p>}
          </>
        ) : (
          <>
            {draft.venueName.trim() && <p className="font-medium">{draft.venueName.trim()}</p>}
            <p className={draft.venueName.trim() ? undefined : 'font-medium'}>{place?.label}</p>
            {draft.room.trim() && <p>{draft.room.trim()}</p>}
          </>
        )}
        {place?.manual && <p className="text-gray-11">{t('submit.summary.manual_value')}</p>}
      </Fact>

      {contact.length > 0 && (
        <Fact icon={UserRound} label={t('submit.summary.contact')} onEdit={() => onEdit('details')}>
          {contact.map((line) => (
            <p key={line} className="break-words">
              {line}
            </p>
          ))}
        </Fact>
      )}

      {description && (
        <Fact
          icon={AlignLeft}
          label={t('submit.about.description_label')}
          onEdit={() => onEdit('details')}
        >
          <p className="whitespace-pre-line">{description}</p>
        </Fact>
      )}

      {website && (
        <Fact
          icon={Globe}
          label={t(
            draft.signup === 'elsewhere' ? 'submit.signup.link_label' : 'submit.more.website_label',
          )}
          onEdit={() => onEdit('details')}
        >
          {draft.signup === 'elsewhere' && (
            <p className="font-medium">{t('submit.signup.elsewhere')}</p>
          )}
          <p className="break-all">{website}</p>
        </Fact>
      )}

      {leftOut.length > 0 && (
        <div className="flex items-center justify-between gap-2 border-t border-gray-5 px-gutter py-2.5">
          <p className="text-xs text-gray-11">
            {t('submit.review.left_out', { parts: leftOut.join(', ') })}
          </p>
          <Button
            className={`-my-1 -me-2 shrink-0 ${TALL_TARGET}`}
            color="primary"
            size="sm"
            variant="ghost"
            onClick={() => onEdit('details')}
          >
            {t('submit.review.add')}
          </Button>
        </div>
      )}
    </article>
  )
}

/** One line of the listing: its icon, what it says, and the way back to the step that set it. */
function Fact({
  icon: Icon,
  label,
  onEdit,
  children,
}: {
  icon: LucideIcon
  label: string
  onEdit: () => void
  children: ReactNode
}) {
  return (
    <section
      aria-label={label}
      className="flex items-start gap-3 border-t border-gray-5 px-gutter py-3 text-sm leading-snug"
    >
      <Icon aria-hidden className="mt-0.5 shrink-0 text-primary" size={18} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">{children}</div>
      <EditButton label={label} onClick={onEdit} />
    </section>
  )
}

/** A date in words, year included — on Check every date is checked, so none is left implied. */
export const longDate = (iso: string, locale: string) =>
  DateTime.fromISO(iso).setLocale(locale).toLocaleString(DateTime.DATE_FULL)

/** A 32px button that takes taps across 44px, without pushing the rows apart. */
const TALL_TARGET = 'relative after:absolute after:inset-x-0 after:-inset-y-1.5'

function EditButton({ label, onClick }: { label: string; onClick: () => void }) {
  const { t } = useTranslation()

  return (
    <Button
      aria-label={`${t('submit.review.edit')}: ${label}`}
      className={`-my-1 -me-2 shrink-0 ${TALL_TARGET}`}
      color="primary"
      size="sm"
      variant="ghost"
      onClick={onClick}
    >
      {t('submit.review.edit')}
    </Button>
  )
}

/** The fields that say when a class meets, apart from when it stops. */
const SCHEDULE_CORE = [
  'repeats',
  'monthlyBy',
  'startTime',
  'endTime',
  'firstDate',
  'timeZone',
] as const

type Change = {
  key: ChangeKey
  label: string
  before?: string
  after: string
  edit: SummaryRow['section'] | 'note'
}

/**
 * Only what the correction changes, each as the listing says it now and as it should — read off
 * the same rows a new listing is built from, so nothing that is sent goes unshown. Each change
 * can be taken back on its own, and another can be added to the same report.
 *
 * A "stopped running" report is one thing, not three: its status, its last class and what the
 * visitor knows sit on one card with one way to remove it. A note is shown as what it is —
 * information for the coordinator — never as a change to the listing.
 */
function ChangeList({
  base,
  baseDraft,
  draft,
  listing,
  reported,
  nobodyOn,
  note,
  onEdit,
  onEditReport,
  onUndo,
  onMore,
}: {
  base: Event
  baseDraft: ListingDraft
  draft: ListingDraft
  listing: Event
  reported: boolean
  nobodyOn: string | null
  note: string
  onEdit: (section: ListingSection | 'note') => void
  onEditReport?: (report: 'stopped' | 'nobody') => void
  onUndo?: (key: ChangeKey, remaining: number) => void
  onMore?: () => void
}) {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const keep = { correction: true, keepTitle: baseDraft.title }
  const before = useSummaryRows(baseDraft, base, keep)
  const after = useSummaryRows(draft, listing, keep)
  const changes: Change[] = []
  // The schedule line reads a past last date as "This event has ended". When only the last date
  // moved, that is the Last class line's news, not a change to when the class meets.
  const sameSchedule = SCHEDULE_CORE.every((field) => draft[field] === baseDraft[field])
  const lastMoved = draft.endDate !== baseDraft.endDate

  for (const row of after) {
    const was = before.find((candidate) => candidate.key === row.key)

    if (was?.value === row.value) continue
    if (row.key === 'schedule' && sameSchedule) continue
    // A stopped class's last date belongs to its report.
    if (row.key === 'last' && reported) continue
    changes.push({
      key: row.key,
      label: row.label,
      // The join link and contact address are never read from a published class, so a new one
      // replaces something this screen cannot show.
      before: was?.value || t(was ? 'submit.review.not_given' : 'submit.changes.unknown'),
      after: row.value || t('submit.changes.removed'),
      edit: row.section,
    })
  }

  const info = note.trim()
  const nobody = nobodyOn !== null
  const hasReport = reported || nobody
  const total =
    changes.length + (reported ? 1 : 0) + (nobody ? 1 : 0) + (!hasReport && info ? 1 : 0)
  const undo = (key: ChangeKey) => onUndo?.(key, total - 1)

  return (
    <div className="flex flex-col gap-3">
      {total === 0 ? (
        <p className="rounded-lg bg-gray-2 px-3 py-3 text-sm text-gray-11">
          {t('submit.changes.none')}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-gray-5 rounded-lg border border-gray-6">
          {reported && (
            <ChangeCard
              label={t('submit.changes.report_title')}
              removeLabel={t('submit.changes.report_remove')}
              onEdit={() => onEditReport?.('stopped')}
              onRemove={onUndo && (() => undo('stopped'))}
            >
              <p className="text-sm font-medium">{t('submit.changes.stopped')}</p>
              <p className="text-sm text-gray-11">
                {lastMoved && draft.endDate
                  ? t('submit.changes.report_last', { date: longDate(draft.endDate, locale) })
                  : t('submit.changes.report_last_unknown')}
              </p>
              {info && <Info note={info} />}
            </ChangeCard>
          )}
          {nobody && (
            <ChangeCard
              label={t('submit.changes.report_title')}
              removeLabel={t('submit.changes.report_remove')}
              onEdit={() => onEditReport?.('nobody')}
              onRemove={onUndo && (() => undo('nobody'))}
            >
              <p className="text-sm font-medium">{t('submit.changes.nobody')}</p>
              {nobodyOn && (
                <p className="text-sm text-gray-11">
                  {t('submit.changes.nobody_on', { date: longDate(nobodyOn, locale) })}
                </p>
              )}
              {!reported && info && <Info note={info} />}
            </ChangeCard>
          )}
          {changes.map((change) => (
            <ChangeCard
              key={change.key}
              label={change.label}
              onEdit={() => onEdit(change.edit)}
              onRemove={onUndo && (() => undo(change.key))}
            >
              <dl className="grid grid-cols-[48px_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
                {change.before !== undefined && (
                  <>
                    <dt className="text-gray-11">{t('submit.changes.was')}</dt>
                    <dd className="break-words whitespace-pre-line text-gray-11">
                      {change.before}
                    </dd>
                  </>
                )}
                <dt className="font-semibold text-primary-11">{t('submit.changes.now')}</dt>
                <dd className="font-medium break-words whitespace-pre-line">{change.after}</dd>
              </dl>
            </ChangeCard>
          ))}
          {!hasReport && info && (
            <ChangeCard
              label={t('submit.changes.report_info')}
              onEdit={() => onEdit('note')}
              onRemove={onUndo && (() => undo('note'))}
            >
              <p className="text-sm break-words whitespace-pre-line">{info}</p>
            </ChangeCard>
          )}
        </ul>
      )}
      {onMore && (
        <Button className="self-start" color="primary" variant="flat" onClick={onMore}>
          {t('submit.changes.more')}
        </Button>
      )}
    </div>
  )
}

/** What the visitor told the coordinator, under the report it explains. */
function Info({ note }: { note: string }) {
  const { t } = useTranslation()

  return (
    <div className="mt-1 rounded-md bg-gray-2 px-3 py-2">
      <p className="text-xs text-gray-11">{t('submit.changes.report_info')}</p>
      <p className="text-sm break-words whitespace-pre-line">{note}</p>
    </div>
  )
}

/** One entry on a correction's Check: what it is, the way back to it, and the way to drop it. */
function ChangeCard({
  label,
  removeLabel,
  onEdit,
  onRemove,
  children,
}: {
  label: string
  /** The remove action's full name, where Undo would undersell it (a whole report). */
  removeLabel?: string
  onEdit: () => void
  onRemove?: () => void
  children: ReactNode
}) {
  const { t } = useTranslation()
  const remove = t(removeLabel ? 'submit.changes.remove' : 'submit.changes.undo')

  return (
    <li className="flex flex-col gap-2 px-3 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-gray-11">{label}</span>
        <div className="-my-1 -me-2 flex shrink-0 items-center">
          <EditButton label={label} onClick={onEdit} />
          {onRemove && (
            <Button
              aria-label={removeLabel ?? `${remove}: ${label}`}
              className={`ms-1 ${TALL_TARGET}`}
              color="neutral"
              size="sm"
              variant="ghost"
              onClick={onRemove}
            >
              <RotateCcw aria-hidden size={14} />
              {remove}
            </Button>
          )}
        </div>
      </div>
      {children}
    </li>
  )
}
