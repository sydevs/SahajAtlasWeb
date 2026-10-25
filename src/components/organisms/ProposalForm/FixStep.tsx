import type { FixIntent, ListingSender } from '@/lib/proposal'
import type { TranslationKey } from '@/types/i18next'
import type { LucideIcon } from 'lucide-react'

import { useTranslation } from 'react-i18next'
import {
  CalendarClock,
  ChevronRight,
  CircleOff,
  MapPin,
  MessageSquare,
  UserRound,
} from 'lucide-react'

import { ChoiceCard, FIELD_TEXT, StepHeading } from './fields'

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
 * else is wrong. It is the note the coordinator reads, so it is the whole report.
 */
export function NoteStep({
  intent,
  sender,
  error,
  onSender,
}: {
  intent: 'stopped' | 'other'
  sender: ListingSender
  error?: string | false
  onSender: (patch: Partial<ListingSender>) => void
}) {
  const { t } = useTranslation()
  const stopped = intent === 'stopped'

  return (
    <div className="flex flex-col gap-5">
      <StepHeading
        intro={stopped ? t('submit.note.stopped_intro') : undefined}
        title={t(stopped ? 'submit.note.stopped_title' : 'submit.note.other_title')}
      />
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
