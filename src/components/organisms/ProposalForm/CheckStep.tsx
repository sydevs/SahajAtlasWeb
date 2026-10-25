import type { FixIntent, ListingDraft, ListingSection, ListingSender } from '@/lib/proposal'
import type { Event } from '@/types'
import type { ReactNode, RefObject } from 'react'

import { useTranslation } from 'react-i18next'
import { ArrowDown, ChevronDown } from 'lucide-react'

import { FIELD_TEXT, GroupHeading, StepHeading, ValidatedInput } from './fields'
import { type SummaryRow, useSummaryRows } from './summary'

import { Alert } from '@/components/atoms/Alert'
import { Button } from '@/components/atoms/Button'
import { Textarea } from '@/components/atoms/Textarea'
import { FormField } from '@/components/molecules/FormField'
import { userSubmissionValueMax } from '@/config/api/mutate'

export type CheckStepProps = {
  sender: ListingSender
  onSender: (patch: Partial<ListingSender>) => void
  emailError: boolean
  /** The listing preview, with an Edit link per section — the view builds it. */
  preview?: ReactNode
  /** A correction: what it opened as, and the published class, for the before → after list. */
  correction?: { baseDraft: ListingDraft; event?: Event; intent: FixIntent | null }
  draft: ListingDraft
  listing?: Event
  onEdit: (section: ListingSection | 'note') => void
  challengeRef: RefObject<HTMLDivElement> | ((node: HTMLDivElement | null) => void)
  /** The challenge could not run, so Send cannot either — said, not left as a dead button. */
  challengeBlocked: boolean
  noChanges: boolean
  refusal?: string | false
}

/**
 * The last step: everything that will be sent, then the visitor. A new listing reads back every
 * value, grouped by the step that set it; a correction reads back only what changes. The listing
 * as it will look is one tap away, not in the way of the email field that still needs filling.
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
  challengeRef,
  challengeBlocked,
  noChanges,
  refusal,
}: CheckStepProps) {
  const { t } = useTranslation()
  // A report with no field to change already wrote its note on the step before.
  const noteWritten = correction?.intent === 'stopped' || correction?.intent === 'other'

  return (
    <div className="flex flex-col gap-6">
      {correction ? (
        <>
          <StepHeading intro={t('submit.changes.intro')} title={t('submit.changes.title')} />
          {correction.event && listing && (
            <ChangeList
              base={correction.event}
              baseDraft={correction.baseDraft}
              draft={draft}
              intent={correction.intent}
              listing={listing}
              note={noteWritten ? sender.note : ''}
              onEdit={onEdit}
            />
          )}
        </>
      ) : (
        <>
          <StepHeading intro={t('submit.review.intro')} title={t('submit.review.title')} />
          {listing && <Summary draft={draft} listing={listing} onEdit={onEdit} />}
        </>
      )}

      {preview && (
        // Full-bleed, so the listing lines up with the form around it exactly as it will line
        // up in its own panel — a card inside the sheet would indent it twice.
        <details className="group -mx-6 border-y border-gray-5">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-6 text-sm font-medium [&::-webkit-details-marker]:hidden">
            {t(correction ? 'submit.changes.full_listing' : 'submit.review.see_preview')}
            <ChevronDown
              aria-hidden
              className="text-gray-11 transition-transform group-open:rotate-180"
              size={18}
            />
          </summary>
          <div className="border-t border-gray-5 bg-gray-2 pt-4">{preview}</div>
        </details>
      )}

      <section className="flex flex-col gap-3">
        <GroupHeading help={t('submit.review.email_help')} title={t('submit.review.you_title')} />
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
      {challengeBlocked && (
        <Alert color="danger" description={t('submit.errors.captcha')} role="alert" size="sm" />
      )}
      {noChanges && <Alert color="neutral" description={t('submit.review.no_changes')} size="sm" />}
      {refusal && <Alert color="danger" description={refusal} role="alert" size="sm" />}
    </div>
  )
}

const SECTIONS: ListingSection[] = ['where', 'when', 'details']

/** Every value a new listing sends, in three groups, each with the way back to its step. */
function Summary({
  draft,
  listing,
  onEdit,
}: {
  draft: ListingDraft
  listing: Event
  onEdit: (section: ListingSection) => void
}) {
  const { t } = useTranslation()
  const rows = useSummaryRows(draft, listing)

  return (
    <div className="flex flex-col gap-3">
      {SECTIONS.map((section) => (
        <section key={section} className="rounded-lg border border-gray-6">
          <div className="flex items-center justify-between gap-2 border-b border-gray-5 px-3 py-2">
            <h4 className="text-sm font-semibold">{t(SECTION_TITLES[section])}</h4>
            <EditButton label={t(SECTION_TITLES[section])} onClick={() => onEdit(section)} />
          </div>
          {/* Label beside value: a read-back is scanned down the values, so the labels keep to
              a narrow column rather than doubling every row's height. */}
          <dl className="grid grid-cols-[minmax(0,104px)_minmax(0,1fr)] gap-x-3 gap-y-2 px-3 py-3">
            {rows
              .filter((row) => row.section === section)
              .map((row) => (
                <div key={row.key} className="contents">
                  <dt className="pt-px text-xs leading-5 text-gray-11">{row.label}</dt>
                  <dd
                    className={`text-sm break-words whitespace-pre-line ${
                      row.value ? 'font-medium' : 'text-gray-11'
                    }`}
                  >
                    {row.value || t('submit.review.not_given')}
                  </dd>
                </div>
              ))}
          </dl>
        </section>
      ))}
    </div>
  )
}

const SECTION_TITLES = {
  where: 'submit.chrome.step_where',
  when: 'submit.chrome.step_when',
  details: 'submit.chrome.step_details',
} as const

function EditButton({ label, onClick }: { label: string; onClick: () => void }) {
  const { t } = useTranslation()

  return (
    <Button
      aria-label={`${t('submit.review.edit')}: ${label}`}
      className="-my-1 -me-2 shrink-0"
      color="primary"
      size="sm"
      variant="ghost"
      onClick={onClick}
    >
      {t('submit.review.edit')}
    </Button>
  )
}

type Change = {
  key: string
  label: string
  before?: string
  after: string
  edit: SummaryRow['section'] | 'note'
}

/**
 * Only what the correction changes, each value as the listing says it now and as it should —
 * read off the same rows a new listing's summary shows, so nothing that is sent goes unshown.
 */
function ChangeList({
  base,
  baseDraft,
  draft,
  listing,
  intent,
  note,
  onEdit,
}: {
  base: Event
  baseDraft: ListingDraft
  draft: ListingDraft
  listing: Event
  intent: FixIntent | null
  note: string
  onEdit: (section: ListingSection | 'note') => void
}) {
  const { t } = useTranslation()
  const keep = { correction: true, keepTitle: baseDraft.title }
  const before = useSummaryRows(baseDraft, base, keep)
  const after = useSummaryRows(draft, listing, keep)
  const changes: Change[] = []

  if (intent === 'stopped') {
    changes.push({
      key: 'stopped',
      label: t('submit.changes.status_label'),
      after: t('submit.changes.stopped'),
      edit: 'note',
    })
  }
  for (const row of after) {
    const was = before.find((candidate) => candidate.key === row.key)

    if (was?.value === row.value) continue
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
  if (note.trim()) {
    changes.push({ key: 'note', label: t('submit.changes.note_label'), after: note, edit: 'note' })
  }

  if (changes.length === 0) {
    return (
      <p className="rounded-lg bg-gray-2 px-3 py-3 text-sm text-gray-11">
        {t('submit.changes.none')}
      </p>
    )
  }

  return (
    <ul className="flex flex-col divide-y divide-gray-5 rounded-lg border border-gray-6">
      {changes.map((change) => (
        <li key={change.key} className="flex items-start gap-3 px-3 py-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-xs text-gray-11">{change.label}</span>
            {change.before !== undefined && (
              <>
                <span className="text-sm break-words whitespace-pre-line text-gray-11 line-through decoration-gray-8">
                  {change.before}
                </span>
                <ArrowDown aria-hidden className="text-gray-9" size={14} />
              </>
            )}
            <span className="text-sm font-medium break-words whitespace-pre-line">
              {change.after}
            </span>
          </div>
          <EditButton label={change.label} onClick={() => onEdit(change.edit)} />
        </li>
      ))}
    </ul>
  )
}
