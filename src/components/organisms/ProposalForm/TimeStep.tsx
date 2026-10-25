import type { ListingDraft, ListingErrors, ListingRepeats } from '@/lib/proposal'
import type { Event } from '@/types'
import type { TranslationKey } from '@/types/i18next'

import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DateTime, Info } from 'luxon'
import { CalendarDays } from 'lucide-react'

import { StepHeading, ValidatedInput, radioKeys } from './fields'
import { useScheduleLines } from './summary'

import { Checkbox } from '@/components/atoms/Checkbox'
import { Combobox } from '@/components/atoms/Combobox'
import { useLocale } from '@/hooks/use-locale'
import {
  draftWeekday,
  endAfter,
  nextWeekdayDate,
  sessionMinutes,
  todayIn,
  weekStart,
} from '@/lib/proposal'
import { zoneLabel } from '@/lib/time'

const REPEATS: { value: ListingRepeats; label: TranslationKey }[] = [
  { value: 'weekly', label: 'submit.when.weekly' },
  { value: 'monthly', label: 'submit.when.monthly' },
  { value: 'once', label: 'submit.when.once' },
]

/** An `HH:MM` time as the visitor's locale writes it ("8:30 PM", "20:30"). */
const formatClock = (time: string, locale: string) =>
  DateTime.fromFormat(time, 'HH:mm').setLocale(locale).toLocaleString(DateTime.TIME_SIMPLE)

const DURATIONS: { minutes: number | null; label: TranslationKey }[] = [
  { minutes: 60, label: 'submit.when.duration_60' },
  { minutes: 90, label: 'submit.when.duration_90' },
  { minutes: 120, label: 'submit.when.duration_120' },
  { minutes: null, label: 'submit.when.duration_custom' },
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
  /** Whether "It ends on a set date" is on — its owner holds it, so Continue can ask for one. */
  ends: boolean
  onEnds: (ends: boolean) => void
  /** The toggle is on and no last date was given, after a Continue. */
  endMissing?: boolean
  onChange: (patch: Partial<ListingDraft>) => void
}

/**
 * Step 2: how often first, then only the fields that answer it. A weekly class is a weekday and
 * a time — the first date follows from them, and can still be moved.
 */
export function TimeStep({
  draft,
  errors,
  listing,
  ends,
  onEnds,
  endMissing = false,
  onChange,
}: TimeStepProps) {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const weekday = draftWeekday(draft)
  const repeating = draft.repeats !== 'once'
  const weekly = draft.repeats === 'weekly'
  // A weekly class with no date yet is missing its day, and is told so at the day chips.
  const dayMissing = weekly && weekday === null && Boolean(errors.firstDate)
  const weekdays = Info.weekdays('short', { locale })
  const weekdayNames = Info.weekdays('long', { locale })
  // The length a session runs, as one of the offered ones — read off the two times, so a class
  // opened for correction shows its own. "Set the end time" is for every other length.
  const stored = sessionMinutes(draft.startTime, draft.endTime)
  const [custom, setCustom] = useState(
    Boolean(draft.endTime) && !DURATIONS.some(({ minutes }) => minutes === stored),
  )
  // A length picked before there is a start time, applied once one is given.
  const [chosen, setChosen] = useState<number | null>(null)
  const duration = DURATIONS.some(({ minutes }) => minutes === stored) ? stored : chosen

  return (
    <div className="flex flex-col gap-5">
      <StepHeading title={t('submit.when.title')} />

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">{t('submit.when.how_often')}</legend>
        <div
          className="grid grid-cols-3 gap-1 rounded-lg bg-gray-2 p-1"
          role="radiogroup"
          {...radioKeys}
        >
          {REPEATS.map(({ value, label }) => (
            <button
              key={value}
              aria-checked={draft.repeats === value}
              className={`${segment} ${draft.repeats === value ? segmentOn : segmentOff}`}
              role="radio"
              tabIndex={draft.repeats === value ? 0 : -1}
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
            {...radioKeys}
          >
            {weekdays.map((label, index) => {
              const day = index + 1
              const on = weekday === day
              // One tab stop per group: the chosen day, or Monday before there is one.

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
                  tabIndex={on || (weekday === null && index === 0) ? 0 : -1}
                  type="button"
                  onClick={() => {
                    if (on) return
                    // Moving the day keeps the week the visitor already chose, never earlier
                    // than this week.
                    const today = todayIn(draft.timeZone)
                    const week = draft.firstDate ? weekStart(draft.firstDate) : today
                    const from = week > today ? week : today

                    onChange({ firstDate: nextWeekdayDate(day, from) })
                  }}
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

      <ValidatedInput
        required
        className="max-w-48"
        error={errors.startTime && t('submit.errors.start_time')}
        id="submit-start-time"
        label={t('submit.when.start_time')}
        type="time"
        value={draft.startTime}
        onChange={(event) => {
          const startTime = event.target.value

          // A chosen length keeps its length when the start moves; a typed end time stays put.
          onChange(
            !custom && duration
              ? { startTime, endTime: endAfter(startTime, duration) }
              : { startTime },
          )
        }}
      />

      <fieldset className="flex flex-col">
        <legend className="mb-2 text-sm font-medium">{t('submit.when.duration')}</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" {...radioKeys}>
          {DURATIONS.map(({ minutes, label }) => {
            const on = minutes === null ? custom : !custom && duration === minutes

            return (
              <button
                key={label}
                aria-checked={on}
                className={`h-11 rounded-md border px-2 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-focus ${
                  on
                    ? 'border-primary-9 bg-primary-9 text-primary-foreground'
                    : 'border-gray-6 hover:bg-gray-2'
                }`}
                role="radio"
                tabIndex={on || (!custom && duration === null && minutes === 60) ? 0 : -1}
                type="button"
                onClick={() => {
                  setCustom(minutes === null)
                  setChosen(minutes)
                  if (minutes !== null && draft.startTime) {
                    onChange({ endTime: endAfter(draft.startTime, minutes) })
                  }
                }}
              >
                {t(label)}
              </button>
            )
          })}
        </div>
      </fieldset>

      {!custom && duration !== null && draft.endTime && (
        <p aria-live="polite" className="-mt-3 text-sm text-gray-11">
          {t('submit.when.ends_at', { time: formatClock(draft.endTime, locale) })}
        </p>
      )}

      {custom && (
        <ValidatedInput
          className="max-w-48"
          help={
            draft.endTime && draft.startTime && draft.endTime < draft.startTime
              ? t('submit.when.overnight')
              : undefined
          }
          id="submit-end-time"
          label={t('submit.when.end_time')}
          type="time"
          value={draft.endTime}
          onChange={(event) => onChange({ endTime: event.target.value })}
        />
      )}

      {/* A weekly class's first date follows from its day, so it shows once there is one —
          prefilled, and still movable for a class that starts later. */}
      {(!weekly || weekday !== null) && (
        <ValidatedInput
          required
          error={errors.firstDate && t('submit.errors.first_date')}
          help={
            draft.repeats === 'monthly'
              ? `${t('submit.when.monthly_help')} ${t('submit.when.monthly_pattern')}`
              : weekly
                ? t('submit.when.first_help')
                : undefined
          }
          id="submit-first-date"
          label={t(
            draft.repeats === 'once'
              ? 'submit.when.date'
              : weekly
                ? 'submit.when.first_on_map'
                : 'submit.when.first_class',
          )}
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
              onEnds(checked)
              if (!checked) onChange({ endDate: '' })
            }}
          >
            {t('submit.when.ends_toggle')}
          </Checkbox>
          {ends && (
            <ValidatedInput
              required
              error={
                (endMissing && t('submit.errors.last_date')) ||
                (errors.endDate && t('submit.errors.end_before'))
              }
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
        draft={draft}
        listing={draft.firstDate && draft.startTime ? listing : undefined}
        zone={draft.timeZone}
        onZone={(timeZone) => onChange({ timeZone })}
      />
    </div>
  )
}

/** The schedule read back in one line, the way the published listing will say it. */
/** Every zone the runtime knows, for a host whose class is not where the guess put it. */
const ZONES: string[] =
  (Intl as { supportedValuesOf?: (key: 'timeZone') => string[] }).supportedValuesOf?.('timeZone') ??
  []

/**
 * The schedule read back in one line, the way the published listing will say it, and the zone
 * it is read in. The zone is a guess from the place, so it can be changed right here.
 */
function ScheduleSummary({
  draft,
  listing,
  zone,
  onZone,
}: {
  draft: ListingDraft
  listing?: Event
  zone: string
  onZone: (zone: string) => void
}) {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const [editing, setEditing] = useState(false)
  const options = useMemo(
    () =>
      editing
        ? ZONES.map((value) => ({ value, label: zoneLabel(value, locale), hint: value }))
        : [],
    [editing, locale],
  )

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-primary-2 px-3 py-3">
      <div className="flex items-start gap-3">
        <CalendarDays aria-hidden className="mt-0.5 shrink-0 text-primary" size={18} />
        <div aria-live="polite" className="min-w-0 flex-1">
          {listing ? (
            <SummaryLine draft={draft} listing={listing} />
          ) : (
            <p className="text-sm text-gray-11">{t('submit.when.summary_empty')}</p>
          )}
          <p className="text-xs text-gray-11">
            {t('submit.when.zone_confirm', { timezone: zoneLabel(zone, locale) })}{' '}
            {!editing && ZONES.length > 0 && (
              <button
                className="rounded-sm font-medium text-primary-11 underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-focus"
                type="button"
                onClick={() => setEditing(true)}
              >
                {t('submit.chrome.change')}
              </button>
            )}
          </p>
        </div>
      </div>
      {editing && (
        <Combobox
          aria-label={t('submit.summary.zone')}
          className="bg-background"
          emptyLabel={t('submit.when.zone_empty')}
          options={options}
          placeholder={zoneLabel(zone, locale)}
          searchPlaceholder={t('submit.when.zone_search')}
          value={zone}
          onValueChange={(value) => {
            onZone(value)
            setEditing(false)
          }}
        />
      )}
    </div>
  )
}

function SummaryLine({ draft, listing }: { draft: ListingDraft; listing: Event }) {
  const lines = useScheduleLines(draft, listing)

  if (!lines) return null

  return (
    <>
      <p className="text-sm font-medium">{lines.pattern}</p>
      {lines.time && <p className="text-sm">{lines.time}</p>}
    </>
  )
}
