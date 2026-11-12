import type { ListingDraft, ListingErrors, ListingRepeats, MonthlyBy } from '@/lib/proposal'
import type { Event } from '@/types'
import type { TranslationKey } from '@/types/i18next'

import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DateTime } from 'luxon'
import { CalendarDays } from 'lucide-react'

import { StepHeading, TextField } from './fields'
import { useScheduleLines } from './summary'

import { Checkbox } from '@/components/atoms/Checkbox'
import { Combobox } from '@/components/atoms/Combobox'
import { RadioGroup } from '@/components/atoms/RadioGroup'
import { ToggleGroup, ToggleGroupItem } from '@/components/atoms/ToggleGroup'
import { FormField } from '@/components/molecules/FormField'
import { useLocale } from '@/hooks/use-locale'
import {
  draftWeekday,
  endAfter,
  firstDateOnDay,
  sessionMinutes,
  todayIn,
  monthWeekNumber,
  monthlyOptions,
  resolvedMonthlyBy,
} from '@/lib/proposal'
import { formatTime, formatWeekday, regionalLocale, weekdayNames, zoneLabel } from '@/lib/time'

const REPEATS: { value: ListingRepeats; label: TranslationKey }[] = [
  { value: 'weekly', label: 'submit.when.weekly' },
  { value: 'monthly', label: 'submit.when.monthly' },
  { value: 'once', label: 'submit.when.once' },
]

/** An `HH:MM` time as every other time on screen writes it: "8:30 PM" in the US, "20:30" in the
 *  UK (`formatTime`). */
const formatClock = (time: string, locale: string) =>
  formatTime(DateTime.fromFormat(time, 'HH:mm', { zone: 'UTC' }), regionalLocale(locale))

const DURATIONS: { minutes: number | null; label: TranslationKey }[] = [
  { minutes: 60, label: 'submit.when.duration_60' },
  { minutes: 90, label: 'submit.when.duration_90' },
  { minutes: 120, label: 'submit.when.duration_120' },
  { minutes: null, label: 'submit.when.duration_custom' },
]

/** The published class's own wording for each week, so the choice reads as the listing will. */
const WEEK_KEYS = {
  '1': 'event.recurrence.monthly_1st',
  '2': 'event.recurrence.monthly_2nd',
  '3': 'event.recurrence.monthly_3rd',
  '4': 'event.recurrence.monthly_4th',
  '-1': 'event.recurrence.monthly_last',
} as const

/** The duration group's value for "Set the end time", beside the lengths in minutes. */
const CUSTOM = 'custom'

export type TimeStepProps = {
  /** A correction: the class already runs, so its past start isn't asked about. */
  correcting?: boolean
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
  correcting = false,
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
  // A weekly class already running needs no first date, and a new day keeps the week it started
  // in, so the question stays away.
  const sinceLongAgo =
    correcting && weekly && Boolean(draft.firstDate) && draft.firstDate < DateTime.now().toISODate()
  const weekdays = weekdayNames(locale, 'short')
  const weekdaysLong = weekdayNames(locale)
  // The length a session runs, as one of the offered ones — read off the two times, so a class
  // opened for correction shows its own. "Set the end time" is for every other length.
  const stored = sessionMinutes(draft.startTime, draft.endTime)
  const [custom, setCustom] = useState(
    Boolean(draft.endTime) && !DURATIONS.some(({ minutes }) => minutes === stored),
  )
  // A length picked before there is a start time, applied once one is given.
  const [chosen, setChosen] = useState<number | null>(null)
  const duration = DURATIONS.some(({ minutes }) => minutes === stored) ? stored : chosen
  const monthlyBy = resolvedMonthlyBy(draft.firstDate, draft.monthlyBy)
  const monthly = monthlyOptions(draft.firstDate).map((by) => {
    const date = DateTime.fromISO(draft.firstDate)
    const name = formatWeekday(date, locale)
    const label =
      by === 'date'
        ? t('event.recurrence.monthly_date', { day: date.day })
        : t(WEEK_KEYS[by === 'last' ? '-1' : monthWeekNumber(date)], { weekday: name })

    return { by, label }
  })

  return (
    <div className="flex flex-col gap-5">
      <StepHeading title={t('submit.when.title')} />

      <FormField as="fieldset" label={t('submit.when.how_often')} name="submit-repeats">
        {(control) => (
          <ToggleGroup
            {...control}
            joined
            required
            className="grid grid-cols-3"
            size="md"
            type="single"
            value={draft.repeats}
            onValueChange={(repeats) => onChange({ repeats: repeats as ListingRepeats })}
          >
            {REPEATS.map(({ value, label }) => (
              <ToggleGroupItem key={value} className="px-1" value={value}>
                {t(label)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}
      </FormField>

      {weekly && (
        <FormField
          required
          as="fieldset"
          error={dayMissing && t('submit.errors.weekday')}
          label={t('submit.when.weekday_label')}
          name="submit-weekday"
        >
          {(control) => (
            <ToggleGroup
              {...control}
              required
              className="grid grid-cols-7"
              size="md"
              type="single"
              value={weekday === null ? '' : String(weekday)}
              onValueChange={(day) =>
                onChange({
                  firstDate: firstDateOnDay(draft.firstDate, Number(day), {
                    today: todayIn(draft.timeZone),
                    keepStart: correcting,
                  }),
                })
              }
            >
              {weekdays.map((label, index) => (
                <ToggleGroupItem
                  key={label}
                  aria-label={weekdaysLong[index]}
                  className="px-0"
                  value={String(index + 1)}
                >
                  {label.replace(/\.$/, '')}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          )}
        </FormField>
      )}

      <TextField
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

      <FormField as="fieldset" label={t('submit.when.duration')} name="submit-duration">
        {(control) => (
          <ToggleGroup
            {...control}
            required
            className="grid grid-cols-2"
            size="md"
            type="single"
            value={custom ? CUSTOM : duration === null ? '' : String(duration)}
            onValueChange={(picked) => {
              const minutes = picked === CUSTOM ? null : Number(picked)

              setCustom(minutes === null)
              setChosen(minutes)
              if (minutes !== null && draft.startTime) {
                onChange({ endTime: endAfter(draft.startTime, minutes) })
              }
            }}
          >
            {DURATIONS.map(({ minutes, label }) => (
              <ToggleGroupItem key={label} value={minutes === null ? CUSTOM : String(minutes)}>
                {t(label)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}
      </FormField>

      {!custom && duration !== null && draft.endTime && (
        <p aria-live="polite" className="-mt-3 text-sm text-gray-11">
          {t('submit.when.ends_at', { time: formatClock(draft.endTime, locale) })}
        </p>
      )}

      {custom && (
        <TextField
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
      {(!weekly || weekday !== null) && !sinceLongAgo && (
        <TextField
          required
          error={errors.firstDate && t('submit.errors.first_date')}
          help={weekly ? t('submit.when.first_help') : undefined}
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

      {draft.repeats === 'monthly' && monthly.length > 1 && (
        <FormField as="fieldset" label={t('submit.when.monthly_by')} name="submit-monthly-by">
          {(control) => (
            <RadioGroup
              {...control}
              name="submit-monthly-by"
              options={monthly.map(({ by, label }) => ({ value: by, label }))}
              value={monthlyBy}
              onChange={(by) => onChange({ monthlyBy: by as MonthlyBy })}
            />
          )}
        </FormField>
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
            <TextField
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
