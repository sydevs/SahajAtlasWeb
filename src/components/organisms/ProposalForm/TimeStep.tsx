import type { ListingDraft, ListingErrors, ListingRepeats } from '@/lib/proposal'
import type { Event } from '@/types'
import type { TranslationKey } from '@/types/i18next'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Info } from 'luxon'
import { CalendarDays } from 'lucide-react'

import { StepHeading, ValidatedInput } from './fields'

import { Checkbox } from '@/components/atoms/Checkbox'
import { useEventDisplay } from '@/hooks/use-event-display'
import { useLocale } from '@/hooks/use-locale'
import { draftWeekday, nextWeekdayDate, todayIn } from '@/lib/proposal'
import { zoneLabel } from '@/lib/time'

const REPEATS: { value: ListingRepeats; label: TranslationKey }[] = [
  { value: 'weekly', label: 'submit.when.weekly' },
  { value: 'monthly', label: 'submit.when.monthly' },
  { value: 'once', label: 'submit.when.once' },
]

const segment =
  'flex h-11 items-center justify-center rounded-md px-2 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-focus'
const segmentOn = 'bg-primary-9 text-primary-foreground shadow-sm'
const segmentOff = 'text-foreground hover:bg-gray-3'

export type TimeStepProps = {
  draft: ListingDraft
  errors: ListingErrors
  /** The listing as it would publish, for the plain-language summary under the fields. */
  listing?: Event
  onChange: (patch: Partial<ListingDraft>) => void
}

/**
 * Step 2: how often first, then only the fields that answer it. A weekly class is a weekday and
 * a time — the first date follows from them, and can still be moved.
 */
export function TimeStep({ draft, errors, listing, onChange }: TimeStepProps) {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const weekday = draftWeekday(draft)
  const repeating = draft.repeats !== 'once'
  const weekly = draft.repeats === 'weekly'
  // A weekly class with no date yet is missing its day, and is told so at the day chips.
  const dayMissing = weekly && weekday === null && Boolean(errors.firstDate)
  const [ends, setEnds] = useState(Boolean(draft.endDate))
  const weekdays = Info.weekdays('short', { locale })
  const weekdayNames = Info.weekdays('long', { locale })

  return (
    <div className="flex flex-col gap-5">
      <StepHeading title={t('submit.when.title')} />

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">{t('submit.when.how_often')}</legend>
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-gray-2 p-1" role="radiogroup">
          {REPEATS.map(({ value, label }) => (
            <button
              key={value}
              aria-checked={draft.repeats === value}
              className={`${segment} ${draft.repeats === value ? segmentOn : segmentOff}`}
              role="radio"
              type="button"
              onClick={() => onChange({ repeats: value, ...(value === 'once' && { endDate: '' }) })}
            >
              {t(label)}
            </button>
          ))}
        </div>
      </fieldset>

      {weekly && (
        <fieldset className="flex flex-col">
          <legend className="mb-2 text-sm font-medium">{t('submit.when.weekday_label')} *</legend>
          <div
            aria-describedby={dayMissing ? 'submit-weekday-error' : undefined}
            className="grid grid-cols-7 gap-1"
            role="radiogroup"
          >
            {weekdays.map((label, index) => {
              const day = index + 1
              const on = weekday === day

              return (
                <button
                  key={label}
                  aria-checked={on}
                  aria-invalid={dayMissing && index === 0 ? true : undefined}
                  aria-label={weekdayNames[index]}
                  className={`h-11 rounded-md border text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-focus ${
                    on
                      ? 'border-primary-9 bg-primary-9 text-primary-foreground'
                      : dayMissing
                        ? 'border-danger-7 hover:bg-gray-2'
                        : 'border-gray-6 hover:bg-gray-2'
                  }`}
                  role="radio"
                  type="button"
                  onClick={() =>
                    onChange({ firstDate: nextWeekdayDate(day, todayIn(draft.timeZone)) })
                  }
                >
                  {label.replace(/\.$/, '')}
                </button>
              )
            })}
          </div>
          {dayMissing && (
            <span className="mt-1 text-xs text-danger-11" id="submit-weekday-error" role="alert">
              {t('submit.errors.weekday')}
            </span>
          )}
        </fieldset>
      )}

      <div className="grid grid-cols-2 gap-3">
        <ValidatedInput
          required
          error={errors.startTime && t('submit.errors.start_time')}
          id="submit-start-time"
          label={t('submit.when.start_time')}
          type="time"
          value={draft.startTime}
          onChange={(event) => onChange({ startTime: event.target.value })}
        />
        <ValidatedInput
          id="submit-end-time"
          label={t('submit.when.end_time')}
          type="time"
          value={draft.endTime}
          onChange={(event) => onChange({ endTime: event.target.value })}
        />
      </div>

      {/* A weekly class's first date follows from its day, so it shows once there is one —
          prefilled, and still movable for a class that starts later. */}
      {(!weekly || weekday !== null) && (
        <ValidatedInput
          required
          error={errors.firstDate && t('submit.errors.first_date')}
          help={draft.repeats === 'monthly' ? t('submit.when.monthly_help') : undefined}
          id="submit-first-date"
          label={t(draft.repeats === 'once' ? 'submit.when.date' : 'submit.when.first_class')}
          type="date"
          value={draft.firstDate}
          onChange={(event) => onChange({ firstDate: event.target.value })}
        />
      )}

      {repeating && (
        <div className="flex flex-col gap-3">
          <Checkbox
            checked={ends}
            onCheckedChange={(checked) => {
              setEnds(checked)
              if (!checked) onChange({ endDate: '' })
            }}
          >
            {t('submit.when.ends_toggle')}
          </Checkbox>
          {ends && (
            <ValidatedInput
              id="submit-end-date"
              label={t('submit.when.last_class')}
              min={draft.firstDate || undefined}
              type="date"
              value={draft.endDate}
              onChange={(event) => onChange({ endDate: event.target.value })}
            />
          )}
        </div>
      )}

      <ScheduleSummary
        listing={draft.firstDate && draft.startTime ? listing : undefined}
        zone={zoneLabel(draft.timeZone, locale)}
      />
    </div>
  )
}

/** The schedule read back in one line, the way the published listing will say it. */
function ScheduleSummary({ listing, zone }: { listing?: Event; zone: string }) {
  const { t } = useTranslation()

  return (
    <div className="flex items-start gap-3 rounded-lg bg-primary-2 px-3 py-3">
      <CalendarDays aria-hidden className="mt-0.5 shrink-0 text-primary" size={18} />
      <div aria-live="polite" className="min-w-0 flex-1">
        {listing ? (
          <SummaryLine listing={listing} />
        ) : (
          <p className="text-sm text-gray-11">{t('submit.when.summary_empty')}</p>
        )}
        <p className="text-xs text-gray-11">{t('submit.when.timezone_note', { timezone: zone })}</p>
      </div>
    </div>
  )
}

function SummaryLine({ listing }: { listing: Event }) {
  const { recurrenceLine, eventTimeRange, whenLine } = useEventDisplay(listing)
  const line = recurrenceLine ? [recurrenceLine, eventTimeRange] : [whenLine, eventTimeRange]

  return <p className="text-sm font-medium">{line.filter(Boolean).join(' · ')}</p>
}
