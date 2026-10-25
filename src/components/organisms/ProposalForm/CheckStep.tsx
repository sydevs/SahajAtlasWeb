import type { FixIntent, ListingDraft, ListingSection, ListingSender } from '@/lib/proposal'
import type { Event } from '@/types'
import type { TranslationKey } from '@/types/i18next'
import type { ReactNode, RefObject } from 'react'

import { useTranslation } from 'react-i18next'
import { ArrowDown, ChevronDown } from 'lucide-react'

import { FIELD_TEXT, GroupHeading, StepHeading, ValidatedInput } from './fields'

import { Alert } from '@/components/atoms/Alert'
import { Button } from '@/components/atoms/Button'
import { Textarea } from '@/components/atoms/Textarea'
import { FormField } from '@/components/molecules/FormField'
import { userSubmissionValueMax } from '@/config/api/mutate'
import { useEventDisplay } from '@/hooks/use-event-display'
import { useLocale } from '@/hooks/use-locale'
import { stepChanged } from '@/lib/proposal'

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

/** The last step: the listing as it will look (or, for a correction, what changes), then you. */
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
          {preview && (
            <details className="group -mx-6 border-y border-gray-5">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-6 text-sm font-medium [&::-webkit-details-marker]:hidden">
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
          <StepHeading intro={t('submit.chrome.preview_note')} title={t('submit.review.title')} />
          {preview && (
            // Full-bleed, so the listing lines up with the form around it exactly as it will
            // line up in its own panel — a card inside the sheet would indent it twice.
            <div className="-mx-6 border-y border-gray-5 bg-gray-2 pt-3">
              <p className="px-6 pb-2 text-[11px] font-semibold tracking-wider text-gray-11 uppercase">
                {t('submit.review.preview_badge')}
              </p>
              {preview}
            </div>
          )}
        </>
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

type Change = {
  key: string
  label: string
  before?: string
  after: string
  section: ListingSection | 'note'
}

/** The detail fields a correction can change, with the label each goes by. */
const DETAIL_FIELDS: { field: keyof ListingDraft; label: TranslationKey }[] = [
  { field: 'title', label: 'submit.more.title_label' },
  { field: 'languages', label: 'submit.more.languages_label' },
  { field: 'contactName', label: 'submit.contact.name_label' },
  { field: 'contactPhone', label: 'submit.contact.phone_label' },
  { field: 'contactEmail', label: 'submit.contact.email_label' },
  { field: 'description', label: 'submit.about.description_label' },
  { field: 'website', label: 'submit.more.website_label' },
]

const clip = (value: string, max = 90) => (value.length > max ? `${value.slice(0, max)}…` : value)

/**
 * Only what the correction changes, each as the listing says it now and as it should say it.
 * A coordinator — and the visitor checking their own report — reads a diff faster than a page.
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
  const { languageLabel } = useLocale()
  const before = useLines(base)
  const after = useLines(listing)
  const changes: Change[] = []
  const text = (field: keyof ListingDraft, value: ListingDraft[keyof ListingDraft]) =>
    field === 'languages'
      ? (value as string[]).map(languageLabel).join(', ')
      : clip(String(value ?? ''))

  if (intent === 'stopped') {
    changes.push({
      key: 'stopped',
      label: t('submit.changes.status_label'),
      after: t('submit.changes.stopped'),
      section: 'note',
    })
  }
  if (stepChanged('when', draft, baseDraft)) {
    changes.push({
      key: 'when',
      label: t('submit.chrome.step_when'),
      before: before.when,
      after: after.when,
      section: 'when',
    })
  }
  if (stepChanged('where', draft, baseDraft)) {
    changes.push({
      key: 'where',
      label: t('submit.chrome.step_where'),
      before: before.where,
      after: after.where,
      section: 'where',
    })
  }
  for (const { field, label } of DETAIL_FIELDS) {
    if (JSON.stringify(draft[field]) === JSON.stringify(baseDraft[field])) continue
    changes.push({
      key: field,
      label: t(label),
      before: text(field, baseDraft[field]) || t('submit.review.not_given'),
      after: text(field, draft[field]) || t('submit.changes.removed'),
      section: 'details',
    })
  }
  if (note.trim()) {
    changes.push({
      key: 'note',
      label: t('submit.changes.note_label'),
      after: note,
      section: 'note',
    })
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
            <span className="text-xs font-semibold tracking-wide text-gray-11 uppercase">
              {change.label}
            </span>
            {change.before !== undefined && (
              <>
                <span className="text-sm text-gray-11 line-through decoration-gray-8">
                  {change.before}
                </span>
                <ArrowDown aria-hidden className="text-gray-9" size={14} />
              </>
            )}
            <span className="text-sm font-medium break-words whitespace-pre-line">
              {change.after}
            </span>
          </div>
          <Button
            aria-label={`${t('submit.review.edit')}: ${change.label}`}
            className="-my-1 shrink-0"
            color="primary"
            size="sm"
            variant="ghost"
            onClick={() => onEdit(change.section)}
          >
            {t('submit.review.edit')}
          </Button>
        </li>
      ))}
    </ul>
  )
}

/** A listing's when and where, each in one line, as its published panel words them. */
function useLines(event: Event): { when: string; where: string } {
  const display = useEventDisplay(event)
  const when = display.recurrenceLine
    ? [display.recurrenceLine, display.eventTimeRange]
    : [display.whenLine, display.eventTimeRange]

  return { when: when.filter(Boolean).join(' · '), where: display.whereLine }
}
