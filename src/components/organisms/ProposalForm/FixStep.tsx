import type { FixIntent, ListingDraft, ListingSender } from '@/lib/proposal'
import type { TranslationKey } from '@/types/i18next'
import type { LucideIcon } from 'lucide-react'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  CalendarClock,
  ChevronRight,
  CircleOff,
  MapPin,
  MessageSquare,
  UserRound,
} from 'lucide-react'

import { ChoiceCard, FIELD_TEXT, StepHeading, ValidatedInput, radioKeys } from './fields'

import { Textarea } from '@/components/atoms/Textarea'
import { FormField } from '@/components/molecules/FormField'
import { userSubmissionValueMax } from '@/config/api/mutate'

const INTENTS: { intent: FixIntent; icon: LucideIcon; label: TranslationKey }[] = [
  { intent: 'when', icon: CalendarClock, label: 'submit.fix.when' },
  { intent: 'where', icon: MapPin, label: 'submit.fix.where' },
  { intent: 'details', icon: UserRound, label: 'submit.fix.details' },
  { intent: 'stopped', icon: CircleOff, label: 'submit.fix.stopped' },
  { intent: 'other', icon: MessageSquare, label: 'submit.fix.other' },
]

/**
 * A correction's first screen. Someone who found a class wrong knows WHAT is wrong long before
 * they know which field holds it, so they say that, and land on only the fields that fix it.
 */
export function FixStep({ onPick }: { onPick: (intent: FixIntent) => void }) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-5">
      <StepHeading intro={t('submit.fix.intro')} title={t('submit.fix.title')} />
      <ul className="flex flex-col gap-2">
        {INTENTS.map(({ intent, icon, label }) => (
          <li key={intent}>
            <ChoiceCard
              icon={icon}
              label={t(label)}
              trailing={<ChevronRight aria-hidden className="shrink-0 text-gray-9" size={18} />}
              onSelect={() => onPick(intent)}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * What a visitor knows when there is no field to change: the class has stopped, or something
 * else is wrong. It is the note the coordinator reads, so it is the whole report. A stopped
 * repeating class is asked for its last date too — and "I'm not sure" is a full answer: the
 * person who found a locked door rarely knows when the last class was.
 */
export function NoteStep({
  intent,
  sender,
  draft,
  base,
  error,
  onSender,
  onChange,
}: {
  intent: 'stopped' | 'other'
  sender: ListingSender
  draft: ListingDraft
  /** The class as published: its last date is what "I'm not sure" leaves in place. */
  base?: ListingDraft
  error?: string | false
  onSender: (patch: Partial<ListingSender>) => void
  onChange: (patch: Partial<ListingDraft>) => void
}) {
  const { t } = useTranslation()
  const stopped = intent === 'stopped'
  const repeating = (base ?? draft).repeats !== 'once'
  const [knows, setKnows] = useState(Boolean(base && draft.endDate !== base.endDate))

  return (
    <div className="flex flex-col gap-5">
      <StepHeading
        intro={stopped ? t('submit.note.stopped_intro') : undefined}
        title={t(stopped ? 'submit.note.stopped_title' : 'submit.note.other_title')}
      />
      {stopped && repeating && (
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-sm font-medium">{t('submit.note.last_question')}</legend>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" {...radioKeys}>
            {([false, true] as const).map((option) => (
              <button
                key={String(option)}
                aria-checked={knows === option}
                className={`h-11 rounded-md border px-2 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-focus ${
                  knows === option
                    ? 'border-primary-9 bg-primary-9 text-primary-foreground'
                    : 'border-gray-6 hover:bg-gray-2'
                }`}
                role="radio"
                tabIndex={knows === option ? 0 : -1}
                type="button"
                onClick={() => {
                  setKnows(option)
                  // Not sure leaves the published last date as it was.
                  if (!option) onChange({ endDate: base?.endDate ?? '' })
                }}
              >
                {t(option ? 'submit.note.last_known' : 'submit.note.last_unsure')}
              </button>
            ))}
          </div>
          {knows && (
            <ValidatedInput
              id="submit-stopped-last"
              label={t('submit.note.last_date')}
              type="date"
              value={draft.endDate}
              onChange={(event) => onChange({ endDate: event.target.value })}
            />
          )}
        </fieldset>
      )}
      <FormField
        error={error}
        htmlFor="submit-note"
        label={t(stopped ? 'submit.note.stopped_label' : 'submit.note.other_label')}
        required={!stopped}
      >
        <Textarea
          aria-invalid={error ? true : undefined}
          className={FIELD_TEXT}
          id="submit-note"
          maxLength={userSubmissionValueMax('note')}
          placeholder={t(
            stopped ? 'submit.note.stopped_placeholder' : 'submit.note.other_placeholder',
          )}
          rows={5}
          value={sender.note}
          onChange={(event) => onSender({ note: event.target.value })}
        />
      </FormField>
    </div>
  )
}
