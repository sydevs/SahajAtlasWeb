import type { ListingDraft, ListingErrors, ListingSender, PickedPlace } from '@/lib/proposal'
import type { CorrectionReason, IsoWeekday } from '@/lib/questions'
import type { GeocodingFeature } from '@mapbox/search-js-core'
import type { LucideIcon } from 'lucide-react'
import type { ComponentProps, ReactNode, Ref } from 'react'

import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DateTime } from 'luxon'
import {
  CalendarClock,
  CalendarDays,
  CalendarRange,
  Check,
  CircleSlash,
  MapPin,
  MessageSquareText,
  Monitor,
  Phone,
  Repeat,
  Users,
} from 'lucide-react'

import { ChoiceCard } from './ChoiceCard'
import { PlaceCard } from './PlaceCard'

import { Button } from '@/components/atoms/Button'
import { Input } from '@/components/atoms/Input'
import { Textarea } from '@/components/atoms/Textarea'
import { FormField, fieldDescribedBy } from '@/components/molecules/FormField'
import { LanguageMultiSelect } from '@/components/molecules/LanguageMultiSelect'
import { MapSearch } from '@/components/organisms/Mapbox/MapSearch'
import { userSubmissionValueMax } from '@/config/api/mutate'
import { useLanguageOptions } from '@/hooks/use-language-options'
import { useLocale } from '@/hooks/use-locale'
import { draftTitle } from '@/lib/proposal'
import { ISO_WEEKDAYS, addMinutes, minutesBetween, nextDateOn, weekdayOf } from '@/lib/questions'

/** Inputs a phone can read without zooming in: iOS zooms any field under 16px. */
const BIG_FIELD = 'h-12 text-base'
const CONTACT_MAX = 100
const TITLE_MAX = 100

/** Start times most classes use, offered as one-tap picks beside the free time field. */
const START_PICKS = ['10:00', '18:00', '18:30', '19:00', '19:30']
const LENGTH_PICKS = [
  { minutes: 60, key: 'submit.ask.time_60' },
  { minutes: 90, key: 'submit.ask.time_90' },
  { minutes: 120, key: 'submit.ask.time_120' },
] as const

/**
 * Languages offered under "Another language", beyond the ones classes already list. The feed
 * only knows languages someone has taught in; a new class may be the first.
 */
const COMMON_LANGUAGES = [
  'en',
  'fr',
  'de',
  'es',
  'it',
  'pt',
  'nl',
  'ru',
  'uk',
  'pl',
  'cs',
  'ro',
  'hu',
  'el',
  'tr',
  'ar',
  'fa',
  'hi',
  'bn',
  'mr',
  'ta',
  'te',
  'ne',
  'zh',
  'ja',
  'ko',
  'sv',
]

export const clockLabel = (time: string, locale: string): string => {
  const parsed = DateTime.fromFormat(time, 'HH:mm')

  return parsed.isValid ? parsed.setLocale(locale).toLocaleString(DateTime.TIME_SIMPLE) : time
}

/** The heading every screen opens with: the question, and one line of help under it. */
export function QuestionTitle({
  id,
  title,
  help,
  headingRef,
}: {
  id: string
  title: string
  help?: ReactNode
  headingRef?: Ref<HTMLHeadingElement>
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <h3
        ref={headingRef}
        className="text-[1.375rem] leading-tight font-semibold tracking-tight text-balance outline-none"
        id={id}
        tabIndex={-1}
      >
        {title}
      </h3>
      {help && <p className="text-[0.9375rem] leading-snug text-gray-11">{help}</p>}
    </div>
  )
}

/** A labelled input whose help and error text are wired to it by id. */
function Field({
  id,
  label,
  help,
  error,
  required,
  className,
  ...input
}: Omit<ComponentProps<typeof Input>, 'id' | 'isInvalid'> & {
  id: string
  label: string
  help?: string
  error?: string | false
  required?: boolean
}) {
  return (
    <FormField error={error} help={help} htmlFor={id} label={label} required={required}>
      <Input
        aria-describedby={fieldDescribedBy({
          name: id,
          help: Boolean(help) && !error,
          error: Boolean(error),
        })}
        className={`${BIG_FIELD} ${className ?? ''}`}
        id={id}
        isInvalid={Boolean(error)}
        {...input}
      />
    </FormField>
  )
}

/** A pill that toggles: the time picks, the length picks and the languages. */
function Pick({
  selected,
  children,
  onClick,
}: {
  selected: boolean
  children: ReactNode
  onClick: () => void
}) {
  return (
    <button
      aria-pressed={selected}
      className={`inline-flex h-11 items-center gap-1.5 rounded-full border px-4 text-[0.9375rem] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-focus ${
        selected
          ? 'border-primary-9 bg-primary-9 text-white'
          : 'border-gray-6 bg-background hover:border-gray-8 hover:bg-gray-2'
      }`}
      type="button"
      onClick={onClick}
    >
      {selected && <Check aria-hidden className="-ms-1 size-4" />}
      {children}
    </button>
  )
}

type ScreenProps = {
  draft: ListingDraft
  errors: ListingErrors
  onChange: (patch: Partial<ListingDraft>) => void
}

// ── Add ──────────────────────────────────────────────────────────────────────────

export function ModeScreen({
  draft,
  onChoose,
}: {
  draft: ListingDraft
  onChoose: (eventType: ListingDraft['eventType']) => void
}) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-3">
      <ChoiceCard
        hint={t('submit.ask.mode_offline_hint')}
        icon={Users}
        label={t('submit.where.offline')}
        selected={draft.eventType === 'offline'}
        onSelect={() => onChoose('offline')}
      />
      <ChoiceCard
        hint={t('submit.ask.mode_online_hint')}
        icon={Monitor}
        label={t('submit.where.online')}
        selected={draft.eventType === 'online'}
        onSelect={() => onChoose('online')}
      />
    </div>
  )
}

export function LinkScreen({ draft, errors, onChange }: ScreenProps) {
  const { t } = useTranslation()

  return (
    <Field
      required
      autoComplete="url"
      error={errors.onlineUrl && t('submit.errors.online_url')}
      id="ask-online-url"
      inputMode="url"
      label={t('submit.where.online_url_label')}
      placeholder={t('submit.where.online_url_placeholder')}
      type="url"
      value={draft.onlineUrl}
      onChange={(event) => onChange({ onlineUrl: event.target.value })}
    />
  )
}

export function PlaceScreen({
  draft,
  errors,
  onChange,
  proximity,
  country,
  notice,
  onPick,
  onEdit,
}: ScreenProps & {
  proximity?: { lng: number; lat: number }
  country?: string
  notice?: ReactNode
  onPick: (key: 'address' | 'city') => (feature: GeocodingFeature) => void
  onEdit: (key: 'address' | 'city') => () => void
}) {
  const { t } = useTranslation()
  const online = draft.eventType === 'online'
  const key = online ? 'city' : 'address'
  const place: PickedPlace | null = draft[key]
  const [searching, setSearching] = useState(!place)
  const error = online
    ? errors.city && t('submit.errors.city_required')
    : errors.address && t('submit.errors.address_required')

  if (place && !searching) {
    return (
      <div className="flex flex-col gap-4">
        <PlaceCard
          action={
            <Button
              className="-my-1 -me-2 shrink-0"
              color="primary"
              size="sm"
              variant="ghost"
              onClick={() => setSearching(true)}
            >
              {t('submit.ask.place_change')}
            </Button>
          }
          place={place}
        />
        {notice}
        {!online && (
          <Field
            id="ask-room"
            label={t('submit.where.room_label')}
            maxLength={CONTACT_MAX}
            placeholder={t('submit.ask.room_placeholder')}
            value={draft.room}
            onChange={(event) => onChange({ room: event.target.value })}
          />
        )}
      </div>
    )
  }

  return (
    <FormField
      required
      error={error}
      help={online ? t('submit.where.city_help') : t('submit.ask.place_not_found')}
      label={online ? t('submit.where.city_label') : t('submit.where.address_label')}
    >
      {/* 16px type in the geocoder's own field, so iOS does not zoom into it. */}
      <div className="[&_input]:!text-base" data-invalid={error ? true : undefined}>
        <MapSearch
          country={country}
          label={
            online ? t('submit.where.city_placeholder') : t('submit.where.address_placeholder')
          }
          proximity={proximity}
          query={{ initial: place?.label ?? '' }}
          types={online ? 'place' : 'address'}
          onQueryChange={onEdit(key)}
          onSelect={(feature) => {
            onPick(key)(feature)
            setSearching(false)
          }}
        />
      </div>
    </FormField>
  )
}

export function OftenScreen({
  draft,
  onChoose,
}: {
  draft: ListingDraft
  onChoose: (repeats: ListingDraft['repeats']) => void
}) {
  const { t } = useTranslation()
  const choices = [
    {
      value: 'weekly',
      icon: Repeat,
      label: t('submit.ask.often_weekly'),
      hint: t('submit.ask.often_weekly_hint'),
    },
    {
      value: 'monthly',
      icon: CalendarRange,
      label: t('submit.ask.often_monthly'),
      hint: t('submit.ask.often_monthly_hint'),
    },
    {
      value: 'once',
      icon: CalendarDays,
      label: t('submit.ask.often_once'),
      hint: t('submit.ask.often_once_hint'),
    },
  ] as const

  return (
    <div className="flex flex-col gap-3">
      {choices.map((choice) => (
        <ChoiceCard
          key={choice.value}
          hint={choice.hint}
          icon={choice.icon}
          label={choice.label}
          selected={draft.repeats === choice.value}
          onSelect={() => onChoose(choice.value)}
        />
      ))}
    </div>
  )
}

export function DayScreen({
  draft,
  errors,
  onChange,
  onWeekday,
}: ScreenProps & { onWeekday: (weekday: IsoWeekday) => void }) {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const weekday = weekdayOf(draft.firstDate)
  const [changingDate, setChangingDate] = useState(false)
  const [hasEnd, setHasEnd] = useState(Boolean(draft.endDate))
  const dateError = errors.firstDate && t('submit.errors.first_date')
  const firstDate = DateTime.fromISO(draft.firstDate)
  const longDate = firstDate.isValid
    ? firstDate.setLocale(locale).toLocaleString({ weekday: 'long', day: 'numeric', month: 'long' })
    : ''

  const dateField = (
    <Field
      required
      error={dateError}
      help={draft.repeats === 'monthly' ? t('submit.ask.day_monthly_help') : undefined}
      id="ask-first-date"
      label={t('submit.when.first_date')}
      type="date"
      value={draft.firstDate}
      onChange={(event) => onChange({ firstDate: event.target.value })}
    />
  )

  const endField = draft.repeats !== 'once' && (
    <div className="flex flex-col gap-3">
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[0.9375rem]">
        <input
          checked={hasEnd}
          className="size-5 accent-[hsl(var(--primary-9))]"
          type="checkbox"
          onChange={(event) => {
            setHasEnd(event.target.checked)
            if (!event.target.checked) onChange({ endDate: '' })
          }}
        />
        {t('submit.ask.day_add_end')}
      </label>
      {hasEnd && (
        <Field
          id="ask-end-date"
          label={t('submit.when.end_date')}
          min={draft.firstDate || undefined}
          type="date"
          value={draft.endDate}
          onChange={(event) => onChange({ endDate: event.target.value })}
        />
      )}
    </div>
  )

  if (draft.repeats !== 'weekly') {
    return (
      <div className="flex flex-col gap-5">
        {dateField}
        {endField}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div
        aria-label={t('submit.ask.day_title_weekly')}
        className="grid grid-cols-7 gap-1.5"
        data-invalid={dateError ? true : undefined}
        role="group"
      >
        {ISO_WEEKDAYS.map((day) => {
          const name = DateTime.fromObject({ weekday: day }).setLocale(locale)
          const selected = weekday === day

          return (
            <button
              key={day}
              aria-label={name.toFormat('cccc')}
              aria-pressed={selected}
              className={`flex h-14 items-center justify-center rounded-lg border text-sm font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-focus ${
                selected
                  ? 'border-primary-9 bg-primary-9 text-white'
                  : 'border-gray-6 bg-background hover:border-gray-8 hover:bg-gray-2'
              }`}
              type="button"
              onClick={() => onWeekday(day)}
            >
              {name.toFormat('ccc')}
            </button>
          )
        })}
      </div>
      {dateError && !changingDate && (
        <p className="-mt-3 text-sm text-danger-11" role="alert">
          {dateError}
        </p>
      )}
      {weekday && !changingDate && (
        <p className="flex items-center gap-2 text-[0.9375rem] text-gray-11">
          <CalendarDays aria-hidden className="size-4 shrink-0" />
          <span className="min-w-0 flex-1">{t('submit.ask.day_first', { date: longDate })}</span>
          <Button
            className="-my-1 shrink-0"
            color="primary"
            size="sm"
            variant="ghost"
            onClick={() => setChangingDate(true)}
          >
            {t('submit.ask.day_change_date')}
          </Button>
        </p>
      )}
      {changingDate && dateField}
      {endField}
    </div>
  )
}

/** Focuses a field the click that revealed it has just rendered. */
const focusSoon = (id: string) => requestAnimationFrame(() => document.getElementById(id)?.focus())

export function TimeScreen({
  draft,
  errors,
  onChange,
  summary,
}: ScreenProps & { summary?: ReactNode }) {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const length = minutesBetween(draft.startTime, draft.endTime)
  // A time the picks don't offer opens its own field, and so does asking for one.
  const [customStart, setCustomStart] = useState(
    Boolean(draft.startTime) && !START_PICKS.includes(draft.startTime),
  )
  const [customEnd, setCustomEnd] = useState(
    Boolean(draft.endTime) && !LENGTH_PICKS.some((pick) => pick.minutes === length),
  )
  const startError = errors.startTime && t('submit.errors.start_time')

  const setStart = (startTime: string) => {
    // Keep the session's length when the start moves, so the end follows it.
    onChange({ startTime, endTime: length ? addMinutes(startTime, length) : draft.endTime })
  }

  return (
    <div className="flex flex-col gap-7">
      <fieldset className="flex flex-col gap-3" data-invalid={startError ? true : undefined}>
        <legend className="mb-3 text-[0.9375rem] font-medium">{t('submit.when.start_time')}</legend>
        <div className="flex flex-wrap gap-2">
          {START_PICKS.map((time) => (
            <Pick
              key={time}
              selected={!customStart && draft.startTime === time}
              onClick={() => {
                setCustomStart(false)
                setStart(time)
              }}
            >
              {clockLabel(time, locale)}
            </Pick>
          ))}
          <Pick
            selected={customStart}
            onClick={() => {
              setCustomStart(true)
              focusSoon('ask-start-time')
            }}
          >
            {t('submit.ask.time_other')}
          </Pick>
        </div>
        {customStart && (
          <Field
            error={startError}
            id="ask-start-time"
            label={t('submit.when.start_time')}
            type="time"
            value={draft.startTime}
            onChange={(event) => setStart(event.target.value)}
          />
        )}
        {startError && !customStart && (
          <p className="text-sm text-danger-11" role="alert">
            {startError}
          </p>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-3" disabled={!draft.startTime}>
        <legend className="mb-3 text-[0.9375rem] font-medium">{t('submit.ask.time_length')}</legend>
        <div className="flex flex-wrap gap-2">
          {LENGTH_PICKS.map((pick) => (
            <Pick
              key={pick.minutes}
              selected={!customEnd && length === pick.minutes}
              onClick={() => {
                setCustomEnd(false)
                onChange({ endTime: addMinutes(draft.startTime, pick.minutes) })
              }}
            >
              {t(pick.key)}
            </Pick>
          ))}
          <Pick
            selected={customEnd}
            onClick={() => {
              setCustomEnd(true)
              focusSoon('ask-end-time')
            }}
          >
            {t('submit.ask.time_other')}
          </Pick>
        </div>
        {customEnd && (
          <Field
            id="ask-end-time"
            label={t('submit.when.end_time')}
            type="time"
            value={draft.endTime}
            onChange={(event) => onChange({ endTime: event.target.value })}
          />
        )}
      </fieldset>

      {summary}
    </div>
  )
}

/** Languages most classes are taught in, offered before the long list. */
const LIKELY_LANGUAGES = ['en', 'fr', 'de', 'es', 'it', 'pt', 'ru', 'hi']

export function LanguageScreen({
  draft,
  onChange,
  languageOptions,
}: Omit<ScreenProps, 'errors'> & { languageOptions: string[] }) {
  const { t } = useTranslation()
  const { languageLabel, languageCode } = useLocale()
  // What the visitor already has, their own language, then the likeliest. Fixed while the
  // visitor toggles, so a chip never jumps out from under a finger.
  const [shown] = useState(() =>
    [...new Set([...draft.languages, languageCode, ...LIKELY_LANGUAGES])].slice(0, 8),
  )
  const all = useMemo(
    () => [...new Set([...shown, ...languageOptions, ...COMMON_LANGUAGES])],
    [shown, languageOptions],
  )
  const options = useLanguageOptions(all)
  const extra = draft.languages.filter((code) => !shown.includes(code))
  const toggle = (code: string) =>
    onChange({
      languages: draft.languages.includes(code)
        ? draft.languages.filter((other) => other !== code)
        : [...draft.languages, code],
    })

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-2">
        {[...shown, ...extra].map((code) => (
          <Pick key={code} selected={draft.languages.includes(code)} onClick={() => toggle(code)}>
            {languageLabel(code)}
          </Pick>
        ))}
      </div>
      <div className="[&_button]:h-12 [&_button]:text-base">
        <LanguageMultiSelect
          label={t('submit.ask.language_more')}
          options={options}
          triggerLabel={t('submit.ask.language_more')}
          value={draft.languages}
          onChange={(languages) => onChange({ languages })}
        />
      </div>
    </div>
  )
}

export function ContactScreen({ draft, errors, onChange }: ScreenProps) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-4">
      <Field
        autoComplete="name"
        id="ask-contact-name"
        label={t('submit.contact.name_label')}
        maxLength={CONTACT_MAX}
        value={draft.contactName}
        onChange={(event) => onChange({ contactName: event.target.value })}
      />
      <Field
        autoComplete="tel"
        id="ask-contact-phone"
        inputMode="tel"
        label={t('submit.contact.phone_label')}
        maxLength={CONTACT_MAX}
        type="tel"
        value={draft.contactPhone}
        onChange={(event) => onChange({ contactPhone: event.target.value })}
      />
      <Field
        autoComplete="email"
        error={errors.contactEmail && t('submit.errors.email')}
        id="ask-contact-email"
        inputMode="email"
        label={t('submit.contact.email_label')}
        maxLength={CONTACT_MAX}
        type="email"
        value={draft.contactEmail}
        onChange={(event) => onChange({ contactEmail: event.target.value })}
      />
      <Field
        error={errors.website && t('submit.errors.online_url')}
        id="ask-website"
        inputMode="url"
        label={t('submit.more.website_label')}
        placeholder="https://"
        type="url"
        value={draft.website}
        onChange={(event) => onChange({ website: event.target.value })}
      />
    </div>
  )
}

export function AboutScreen({ draft, onChange }: Omit<ScreenProps, 'errors'>) {
  const { t } = useTranslation()
  const fallback = draftTitle({ ...draft, title: '' })

  return (
    <div className="flex flex-col gap-5">
      <FormField htmlFor="ask-description" label={t('submit.about.description_label')}>
        <Textarea
          className="text-base"
          id="ask-description"
          maxLength={userSubmissionValueMax('message')}
          placeholder={t('submit.about.description_placeholder')}
          rows={5}
          value={draft.description}
          onChange={(event) => onChange({ description: event.target.value })}
        />
      </FormField>
      <Field
        help={fallback ? t('submit.ask.name_help', { title: fallback }) : undefined}
        id="ask-title"
        label={t('submit.ask.name_label')}
        maxLength={TITLE_MAX}
        value={draft.title}
        onChange={(event) => onChange({ title: event.target.value })}
      />
    </div>
  )
}

// ── Correct ──────────────────────────────────────────────────────────────────────

export function ChangedScreen({
  reason,
  onChoose,
}: {
  reason: CorrectionReason | null
  onChoose: (reason: CorrectionReason) => void
}) {
  const { t } = useTranslation()
  const reasons: { reason: CorrectionReason; icon: LucideIcon; label: string; hint: string }[] = [
    {
      reason: 'time',
      icon: CalendarClock,
      label: t('submit.correct.reason_time'),
      hint: t('submit.correct.reason_time_hint'),
    },
    {
      reason: 'place',
      icon: MapPin,
      label: t('submit.correct.reason_place'),
      hint: t('submit.correct.reason_place_hint'),
    },
    {
      reason: 'contact',
      icon: Phone,
      label: t('submit.correct.reason_contact'),
      hint: t('submit.correct.reason_contact_hint'),
    },
    {
      reason: 'stopped',
      icon: CircleSlash,
      label: t('submit.correct.reason_stopped'),
      hint: t('submit.correct.reason_stopped_hint'),
    },
    {
      reason: 'other',
      icon: MessageSquareText,
      label: t('submit.correct.reason_other'),
      hint: t('submit.correct.reason_other_hint'),
    },
  ]

  return (
    <div className="flex flex-col gap-2.5">
      {reasons.map((row) => (
        <ChoiceCard
          key={row.reason}
          hint={row.hint}
          icon={row.icon}
          label={row.label}
          selected={reason === row.reason}
          onSelect={() => onChoose(row.reason)}
        />
      ))}
    </div>
  )
}

export function StoppedScreen({
  draft,
  base,
  onChange,
  sender,
  onSender,
}: Omit<ScreenProps, 'errors'> & {
  base: ListingDraft
  sender: ListingSender
  onSender: (patch: Partial<ListingSender>) => void
}) {
  const { t } = useTranslation()
  const [knowsDate, setKnowsDate] = useState(draft.endDate !== base.endDate)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <ChoiceCard
          icon={CircleSlash}
          kind="radio"
          label={t('submit.correct.stopped_unsure')}
          selected={!knowsDate}
          onSelect={() => {
            setKnowsDate(false)
            onChange({ endDate: base.endDate })
          }}
        />
        <ChoiceCard
          icon={CalendarDays}
          kind="radio"
          label={t('submit.correct.stopped_on')}
          selected={knowsDate}
          onSelect={() => setKnowsDate(true)}
        />
      </div>
      {knowsDate && (
        <Field
          id="ask-last-date"
          label={t('submit.correct.stopped_date')}
          type="date"
          value={draft.endDate === base.endDate ? '' : draft.endDate}
          onChange={(event) => onChange({ endDate: event.target.value })}
        />
      )}
      <FormField htmlFor="ask-stopped-note" label={t('submit.correct.stopped_note_label')}>
        <Textarea
          className="text-base"
          id="ask-stopped-note"
          maxLength={userSubmissionValueMax('note')}
          rows={3}
          value={sender.note}
          onChange={(event) => onSender({ note: event.target.value })}
        />
      </FormField>
    </div>
  )
}

export function NoteScreen({
  sender,
  onSender,
  error,
}: {
  sender: ListingSender
  onSender: (patch: Partial<ListingSender>) => void
  error?: string | false
}) {
  return (
    <FormField announceError error={error} htmlFor="ask-note" label="">
      <Textarea
        aria-describedby={fieldDescribedBy({ name: 'ask-note', error: Boolean(error) })}
        className="text-base"
        id="ask-note"
        isInvalid={Boolean(error)}
        maxLength={userSubmissionValueMax('note')}
        rows={6}
        value={sender.note}
        onChange={(event) => onSender({ note: event.target.value })}
      />
    </FormField>
  )
}

/** The weekday picks fill in the first date; exported for the flow to call. */
export const weekdayDate = (weekday: IsoWeekday, timeZone: string) => nextDateOn(weekday, timeZone)
