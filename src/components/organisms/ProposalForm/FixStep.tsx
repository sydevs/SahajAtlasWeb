import type { FixIntent, ListingDraft, ListingSender } from '@/lib/proposal'
import type { TranslationKey } from '@/types/i18next'
import type { LucideIcon } from 'lucide-react'

import { useState } from 'react'
import { DateTime } from 'luxon'
import { useTranslation } from 'react-i18next'
import {
  CalendarClock,
  ChevronRight,
  CircleOff,
  MapPin,
  MessageSquare,
  UserRound,
  UserX,
} from 'lucide-react'

import { StepHeading, TextField } from './fields'

import { Textarea } from '@/components/atoms/Textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/atoms/ToggleGroup'
import { FormField } from '@/components/molecules/FormField'
import { userSubmissionValueMax } from '@/config/api/mutate'

const INTENTS: { intent: FixIntent; icon: LucideIcon; label: TranslationKey }[] = [
  { intent: 'when', icon: CalendarClock, label: 'submit.fix.when' },
  { intent: 'where', icon: MapPin, label: 'submit.fix.where' },
  { intent: 'details', icon: UserRound, label: 'submit.fix.details' },
  { intent: 'nobody', icon: UserX, label: 'submit.fix.nobody' },
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
        {INTENTS.map(({ intent, icon: Icon, label }) => (
          <li key={intent}>
            {/* Each answer goes straight to the step that fixes it: a list of ways on, not a
                choice to confirm, so these are buttons rather than a radio group. */}
            <button
              className="flex min-h-14 w-full items-center gap-3 rounded border border-gray-7 bg-background px-3 py-2.5 text-start text-sm font-semibold transition-colors outline-none hover:bg-gray-2 focus-visible:ring-2 focus-visible:ring-focus"
              type="button"
              onClick={() => onPick(intent)}
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gray-3 text-gray-11">
                <Icon aria-hidden size={18} />
              </span>
              <span className="min-w-0 flex-1 leading-tight">{t(label)}</span>
              <ChevronRight
                aria-hidden
                className="shrink-0 text-gray-9 rtl:-scale-x-100"
                size={18}
              />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * What a visitor knows when there is no field to change: the class has stopped, or something
 * else is wrong. It is the note the admins read, so it is the whole report. A stopped
 * repeating class is asked for its last date too — and "I'm not sure" is a full answer: the
 * person who found a locked door rarely knows when the last class was.
 */
export function NoteStep({
  intent,
  sender,
  draft,
  base,
  error,
  nobodyOn = '',
  onNobodyOn,
  onSender,
  onChange,
}: {
  intent: 'stopped' | 'nobody' | 'other'
  sender: ListingSender
  draft: ListingDraft
  /** The class as published: its last date is what "I'm not sure" leaves in place. */
  base?: ListingDraft
  error?: string | false
  /** The day someone went, for a report that nobody was there. */
  nobodyOn?: string
  onNobodyOn?: (date: string) => void
  onSender: (patch: Partial<ListingSender>) => void
  onChange: (patch: Partial<ListingDraft>) => void
}) {
  const { t } = useTranslation()
  const stopped = intent === 'stopped'
  const nobody = intent === 'nobody'
  const repeating = (base ?? draft).repeats !== 'once'
  const [knows, setKnows] = useState(Boolean(base && draft.endDate !== base.endDate))

  return (
    <div className="flex flex-col gap-5">
      <StepHeading
        intro={
          stopped
            ? t('submit.note.stopped_intro')
            : nobody
              ? t('submit.note.nobody_intro')
              : undefined
        }
        title={t(
          stopped
            ? 'submit.note.stopped_title'
            : nobody
              ? 'submit.note.nobody_title'
              : 'submit.note.other_title',
        )}
      />
      {nobody && (
        <TextField
          id="submit-nobody-date"
          label={t('submit.note.nobody_date')}
          max={DateTime.now().toISODate() ?? undefined}
          type="date"
          value={nobodyOn}
          onChange={(event) => onNobodyOn?.(event.target.value)}
        />
      )}
      {stopped && repeating && (
        <div className="flex flex-col gap-3">
          <FormField as="fieldset" label={t('submit.note.last_question')} name="submit-last-known">
            {(control) => (
              <ToggleGroup
                {...control}
                required
                className="grid grid-cols-2"
                size="md"
                type="single"
                value={knows ? 'known' : 'unsure'}
                onValueChange={(answer) => {
                  setKnows(answer === 'known')
                  // Not sure leaves the published last date as it was.
                  if (answer === 'unsure') onChange({ endDate: base?.endDate ?? '' })
                }}
              >
                <ToggleGroupItem value="unsure">{t('submit.note.last_unsure')}</ToggleGroupItem>
                <ToggleGroupItem value="known">{t('submit.note.last_known')}</ToggleGroupItem>
              </ToggleGroup>
            )}
          </FormField>
          {knows && (
            <TextField
              id="submit-stopped-last"
              label={t('submit.note.last_date')}
              type="date"
              value={draft.endDate}
              onChange={(event) => onChange({ endDate: event.target.value })}
            />
          )}
        </div>
      )}
      <FormField
        error={error}
        htmlFor="submit-note"
        label={t(stopped || nobody ? 'submit.note.stopped_label' : 'submit.note.other_label')}
        required={!stopped && !nobody}
      >
        {(control) => (
          <Textarea
            {...control}
            maxLength={userSubmissionValueMax('note')}
            placeholder={t(
              stopped
                ? 'submit.note.stopped_placeholder'
                : nobody
                  ? 'submit.note.nobody_placeholder'
                  : 'submit.note.other_placeholder',
            )}
            rows={5}
            value={sender.note}
            onChange={(event) => onSender({ note: event.target.value })}
          />
        )}
      </FormField>
    </div>
  )
}
