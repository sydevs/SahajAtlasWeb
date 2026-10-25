import type { InputProps } from '@/components/atoms/Input'
import type { ListingDraft, ListingErrors } from '@/lib/proposal'
import type { GeocodingFeature } from '@mapbox/search-js-core'
import type { ReactNode } from 'react'

import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DateTime, Info } from 'luxon'
import { Plus } from 'lucide-react'

import { Button } from '@/components/atoms/Button'
import { Combobox, type ComboboxOption } from '@/components/atoms/Combobox'
import { Input } from '@/components/atoms/Input'
import { Textarea } from '@/components/atoms/Textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/atoms/ToggleGroup'
import { FormField, fieldDescribedBy } from '@/components/molecules/FormField'
import { LanguageMultiSelect } from '@/components/molecules/LanguageMultiSelect'
import { MapSearch } from '@/components/organisms/Mapbox/MapSearch'
import { USER_SUBMISSION_VALUE_MAX, userSubmissionValueMax } from '@/config/api/mutate'
import { useLanguageOptions } from '@/hooks/use-language-options'
import { useLocale } from '@/hooks/use-locale'
import { draftWeekday, nextWeekdayDate } from '@/lib/proposal'

// The editors each section of the listing opens into (#147). Sized for a thumb: every control is
// 44px tall below md, and text inputs use 16px type there, so iOS does not zoom into a field.

/** The contact fields' bound on an Event. */
const CONTACT_MAX = 100

/** The control height and type size every editor shares. */
export const TOUCH = 'h-11 text-base md:h-10 md:text-sm'

export type FieldsProps = {
  draft: ListingDraft
  errors: ListingErrors
  onChange: (patch: Partial<ListingDraft>) => void
}

/** A labelled input whose help and error text are wired to it by id. */
function ValidatedInput({
  id,
  label,
  required,
  help,
  error,
  className,
  ...input
}: Omit<InputProps, 'id' | 'isInvalid'> & {
  id: string
  label: string
  required?: boolean
  help?: string
  /** The error sentence, shown in place of the help while set. */
  error?: string | false
}) {
  return (
    <FormField error={error} help={help} htmlFor={id} label={label} required={required}>
      <Input
        aria-describedby={fieldDescribedBy({
          name: id,
          help: Boolean(help) && !error,
          error: Boolean(error),
        })}
        className={`${TOUCH} ${className ?? ''}`}
        id={id}
        isInvalid={Boolean(error)}
        {...input}
      />
    </FormField>
  )
}

/** A segmented choice that spans the editor, one equal cell per option. */
function Choice({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: { value: string; label: ReactNode }[]
  onChange: (value: string) => void
}) {
  return (
    <ToggleGroup
      joined
      aria-label={label}
      className="w-full"
      type="single"
      value={value}
      onValueChange={(next) => next && onChange(next)}
    >
      {options.map((option) => (
        <ToggleGroupItem
          key={option.value}
          className="h-11 flex-1 text-sm md:h-10"
          value={option.value}
        >
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

/** A venue typed by hand, as typed — untrimmed, so a space survives the keystroke. */
export type HandAddress = { street: string; city: string; postCode: string; country: string }

export const handAddressOf = (draft: ListingDraft): HandAddress => ({
  street: draft.address?.street ?? '',
  city: draft.address?.city ?? '',
  postCode: draft.address?.postCode ?? '',
  country: draft.address?.country ?? '',
})

/** Not countries, though `Intl.DisplayNames` names them. */
const NOT_COUNTRIES = new Set(['EU', 'EZ', 'UN', 'QO', 'ZZ', 'XA', 'XB', 'AA', 'XK'])

/** Every ISO 3166-1 country the browser can name, in the visitor's language, A–Z. */
const countryOptions = (locale: string): ComboboxOption[] => {
  const names = new Intl.DisplayNames([locale], { type: 'region' })
  const options: ComboboxOption[] = []

  for (let a = 65; a <= 90; a += 1) {
    for (let b = 65; b <= 90; b += 1) {
      const code = String.fromCharCode(a, b)
      const name = names.of(code)

      if (name && name !== code && !NOT_COUNTRIES.has(code))
        options.push({ value: code, label: name })
    }
  }

  return options.sort((x, y) => x.label.localeCompare(y.label, locale))
}

export function WhereFields({
  draft,
  errors,
  onChange,
  onPick,
  onEdit,
  proximity,
  country,
  linkKept,
  notice,
  manual,
  onManual,
  hand,
  onHand,
}: FieldsProps & {
  onPick: (key: 'address' | 'city') => (feature: GeocodingFeature) => void
  onEdit: (key: 'address' | 'city') => () => void
  proximity?: { lng: number; lat: number }
  country?: string
  /** A correction to an online class: the stored join link stays unless a new one is typed. */
  linkKept?: boolean
  /** Under the address once one is picked — the "is it one of these?" check. */
  notice?: ReactNode
  /**
   * Typing the venue by hand instead — a village hall or park the search cannot find — for a
   * coordinator to place. Owned by the editor, so a half-typed address survives this closing.
   */
  manual: boolean
  onManual: (manual: boolean) => void
  hand: HandAddress
  onHand: (hand: HandAddress) => void
}) {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const countries = useMemo(
    () => (manual && !country ? countryOptions(locale) : []),
    [manual, country, locale],
  )
  // The draft takes the address only once it names the street, the town and the country —
  // enough for a coordinator to find it.
  const typed = (patch: Partial<HandAddress>) => {
    const next = { ...hand, ...patch }
    const [street, city, postCode] = [next.street.trim(), next.city.trim(), next.postCode.trim()]
    const nation = country?.toUpperCase() ?? next.country

    onHand(next)
    onChange({
      address:
        street && city && nation
          ? {
              label: [street, postCode, city].filter(Boolean).join(', '),
              street,
              city,
              postCode: postCode || undefined,
              country: nation,
              location: {},
            }
          : null,
    })
  }

  return (
    <>
      <Choice
        label={t('submit.where.title')}
        options={[
          { value: 'offline', label: t('submit.where.offline') },
          { value: 'online', label: t('submit.where.online') },
        ]}
        value={draft.eventType}
        onChange={(eventType) => onChange({ eventType: eventType as ListingDraft['eventType'] })}
      />

      {draft.eventType === 'offline' ? (
        <>
          {manual ? (
            <>
              <ValidatedInput
                required
                autoComplete="address-line1"
                error={errors.address && t('submit.errors.manual_address')}
                id="submit-manual-street"
                label={t('submit.where.manual_street')}
                maxLength={CONTACT_MAX}
                value={hand.street}
                onChange={(event) => typed({ street: event.target.value })}
              />
              <div className="grid grid-cols-[1fr_7rem] gap-3">
                <ValidatedInput
                  required
                  autoComplete="address-level2"
                  id="submit-manual-city"
                  label={t('submit.where.manual_city')}
                  maxLength={CONTACT_MAX}
                  value={hand.city}
                  onChange={(event) => typed({ city: event.target.value })}
                />
                <ValidatedInput
                  autoComplete="postal-code"
                  id="submit-manual-postcode"
                  label={t('submit.where.manual_postcode')}
                  maxLength={20}
                  value={hand.postCode}
                  onChange={(event) => typed({ postCode: event.target.value })}
                />
              </div>
              {!country && (
                <FormField required label={t('submit.where.manual_country')}>
                  <Combobox
                    aria-label={t('submit.where.manual_country')}
                    className={TOUCH}
                    options={countries}
                    searchPlaceholder={t('submit.where.manual_country')}
                    value={hand.country}
                    onValueChange={(code) => typed({ country: code })}
                  />
                </FormField>
              )}
              <p className="-mt-2 text-xs text-gray-11">{t('submit.where.manual_note')}</p>
              <Button
                className="-ms-2 self-start"
                color="primary"
                size="sm"
                variant="ghost"
                // What was typed stays in the search field; any edit there drops it.
                onClick={() => onManual(false)}
              >
                {t('submit.where.search_instead')}
              </Button>
            </>
          ) : (
            <>
              <FormField
                required
                error={errors.address && t('submit.errors.address_required')}
                help={t('submit.where.address_help')}
                label={t('submit.where.address_label')}
              >
                <MapSearch
                  country={country}
                  label={t('submit.where.address_placeholder')}
                  proximity={proximity}
                  query={{ initial: draft.address?.label ?? '' }}
                  types="address"
                  onQueryChange={onEdit('address')}
                  onSelect={onPick('address')}
                />
              </FormField>
              {!draft.address && (
                <Button
                  className="-ms-2 -mt-2 self-start"
                  color="primary"
                  size="sm"
                  variant="ghost"
                  onClick={() => onManual(true)}
                >
                  {t('submit.where.manual_toggle')}
                </Button>
              )}
            </>
          )}
          {notice}
          <ValidatedInput
            id="submit-room"
            label={t('submit.where.room_label')}
            maxLength={CONTACT_MAX}
            value={draft.room}
            onChange={(event) => onChange({ room: event.target.value })}
          />
        </>
      ) : (
        <>
          <ValidatedInput
            error={errors.onlineUrl && t('submit.errors.online_url')}
            help={linkKept ? t('submit.where.link_kept') : undefined}
            id="submit-online-url"
            inputMode="url"
            label={t('submit.where.online_url_label')}
            placeholder={t('submit.where.online_url_placeholder')}
            required={!linkKept}
            type="url"
            value={draft.onlineUrl}
            onChange={(event) => onChange({ onlineUrl: event.target.value })}
          />
          <FormField
            required
            error={errors.city && t('submit.errors.city_required')}
            help={t('submit.where.city_help')}
            label={t('submit.where.city_label')}
          >
            <MapSearch
              country={country}
              label={t('submit.where.city_placeholder')}
              proximity={proximity}
              query={{ initial: draft.city?.label ?? '' }}
              types="place"
              onQueryChange={onEdit('city')}
              onSelect={onPick('city')}
            />
          </FormField>
        </>
      )}
    </>
  )
}

/** A zone as people say it — "United Kingdom Time" — falling back to its IANA name. */
export const zoneLabel = (timeZone: string, locale: string): string => {
  try {
    const name = new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: 'longGeneric' })
      .formatToParts(new Date())
      .find((part) => part.type === 'timeZoneName')?.value

    return name && name !== timeZone ? `${name} (${timeZone})` : timeZone
  } catch {
    return timeZone
  }
}

/** Every zone the browser knows, the class's own first, each named as people say it. */
const zoneOptions = (current: string, locale: string): ComboboxOption[] => {
  const all: string[] =
    'supportedValuesOf' in Intl
      ? (Intl as unknown as { supportedValuesOf: (key: string) => string[] }).supportedValuesOf(
          'timeZone',
        )
      : []
  const ids = [current, ...all.filter((zone) => zone !== current)]

  return ids.map((zone) => ({
    value: zone,
    label: zone.replace(/_/g, ' '),
    hint: zoneLabel(zone, locale).replace(` (${zone})`, ''),
  }))
}

export function WhenFields({
  draft,
  errors,
  onChange,
  onZone,
  summary,
}: FieldsProps & {
  /** The visitor chose the zone themselves, so a later place pick must not replace it. */
  onZone: () => void
  /** The schedule as the listing will read, under the fields. */
  summary: ReactNode
}) {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const weekday = draftWeekday(draft)
  const repeating = draft.repeats !== 'once'
  // The shared rule flags a backwards range on the first date; it belongs on the last one.
  const endsEarly = repeating && Boolean(draft.endDate) && draft.endDate < draft.firstDate
  const firstDateError = errors.firstDate && !endsEarly
  // An end before the start is read as running past midnight — say so, in case it is a slip.
  const overnight = Boolean(draft.startTime && draft.endTime) && draft.endTime < draft.startTime
  const [zoneOpen, setZoneOpen] = useState(false)
  const zones = useMemo(() => zoneOptions(draft.timeZone, locale), [draft.timeZone, locale])
  const [editStart, setEditStart] = useState(false)
  const [showEnd, setShowEnd] = useState(Boolean(draft.endDate))
  const days = useMemo(
    () => ({ short: Info.weekdays('short', { locale }), long: Info.weekdays('long', { locale }) }),
    [locale],
  )
  const firstDay = draft.firstDate
    ? DateTime.fromISO(draft.firstDate)
        .setLocale(locale)
        .toLocaleString({ weekday: 'short', day: 'numeric', month: 'short' })
    : ''

  const dateField = (label: string) => (
    <ValidatedInput
      required
      error={firstDateError && t('submit.errors.first_date')}
      id="submit-first-date"
      label={label}
      type="date"
      value={draft.firstDate}
      onChange={(event) => onChange({ firstDate: event.target.value })}
    />
  )

  return (
    <>
      <FormField label={t('submit.when.often')}>
        <Choice
          label={t('submit.when.often')}
          options={[
            { value: 'weekly', label: t('filters.cadence.weekly') },
            { value: 'monthly', label: t('filters.cadence.monthly') },
            { value: 'once', label: t('filters.cadence.once') },
          ]}
          value={draft.repeats}
          onChange={(repeats) => onChange({ repeats: repeats as ListingDraft['repeats'] })}
        />
      </FormField>

      {draft.repeats === 'weekly' && (
        <FormField
          required
          error={firstDateError && !weekday && t('submit.errors.weekday')}
          label={t('submit.when.weekday')}
        >
          <ToggleGroup
            aria-label={t('submit.when.weekday')}
            className="grid w-full grid-cols-7 gap-1"
            isInvalid={Boolean(firstDateError) && !weekday}
            type="single"
            value={weekday ? String(weekday) : ''}
            onValueChange={(value) => {
              const day = Number(value)

              if (!day || day === weekday) return
              onChange({ firstDate: nextWeekdayDate(day, draft.timeZone) })
            }}
          >
            {days.short.map((label, index) => (
              <ToggleGroupItem
                key={label}
                aria-label={days.long[index]}
                className="h-11 rounded-lg px-0 text-sm md:h-10"
                value={String(index + 1)}
              >
                {label.slice(0, 3)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {weekday && !editStart && (
            <p className="flex items-center gap-1 text-xs text-gray-11">
              {t('submit.when.starting', { date: firstDay })}
              <Button
                className="h-6 px-1.5 text-xs"
                color="primary"
                size="sm"
                variant="ghost"
                onClick={() => setEditStart(true)}
              >
                {t('submit.when.change_start')}
              </Button>
            </p>
          )}
        </FormField>
      )}
      {draft.repeats === 'weekly' && editStart && dateField(t('submit.when.first_date'))}
      {draft.repeats === 'monthly' && dateField(t('submit.when.first_date'))}
      {draft.repeats === 'once' && dateField(t('submit.when.date'))}

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
          help={overnight ? t('submit.when.overnight') : undefined}
          id="submit-end-time"
          label={t('submit.when.end_time')}
          type="time"
          value={draft.endTime}
          onChange={(event) => onChange({ endTime: event.target.value })}
        />
      </div>

      <div className="-mt-1 flex flex-wrap items-center gap-x-1 text-xs text-gray-11">
        {t('submit.when.timezone_note', { timezone: zoneLabel(draft.timeZone, locale) })}
        {!zoneOpen && (
          <Button
            className="h-6 px-1.5 text-xs"
            color="primary"
            size="sm"
            variant="ghost"
            onClick={() => setZoneOpen(true)}
          >
            {t('submit.when.change_start')}
          </Button>
        )}
      </div>
      {zoneOpen && (
        <FormField label={t('submit.when.timezone_label')}>
          <Combobox
            aria-label={t('submit.when.timezone_label')}
            className={TOUCH}
            options={zones}
            searchPlaceholder={t('submit.when.timezone_search')}
            value={draft.timeZone}
            onValueChange={(timeZone) => {
              onChange({ timeZone })
              onZone()
              setZoneOpen(false)
            }}
          />
        </FormField>
      )}

      {repeating &&
        (showEnd || draft.endDate ? (
          <ValidatedInput
            error={endsEarly && t('submit.errors.end_date')}
            id="submit-end-date"
            label={t('submit.when.end_date')}
            min={draft.firstDate || undefined}
            type="date"
            value={draft.endDate}
            onChange={(event) => onChange({ endDate: event.target.value })}
          />
        ) : (
          <Button
            className="-ms-2 self-start"
            color="primary"
            size="sm"
            variant="ghost"
            onClick={() => setShowEnd(true)}
          >
            <Plus aria-hidden size={16} />
            {t('submit.when.add_end')}
          </Button>
        ))}

      <div className="rounded-lg bg-gray-2 px-3 py-2.5">{summary}</div>
    </>
  )
}

export function ContactFields({ draft, errors, onChange }: FieldsProps) {
  const { t } = useTranslation()

  return (
    <>
      <p className="-mt-2 text-sm text-gray-11">{t('submit.contact.help')}</p>
      <ValidatedInput
        autoComplete="name"
        id="submit-contact-name"
        label={t('submit.contact.name_label')}
        maxLength={CONTACT_MAX}
        value={draft.contactName}
        onChange={(event) => onChange({ contactName: event.target.value })}
      />
      <ValidatedInput
        autoComplete="tel"
        id="submit-contact-phone"
        inputMode="tel"
        label={t('submit.contact.phone_label')}
        maxLength={CONTACT_MAX}
        type="tel"
        value={draft.contactPhone}
        onChange={(event) => onChange({ contactPhone: event.target.value })}
      />
      <ValidatedInput
        autoComplete="email"
        error={errors.contactEmail && t('submit.errors.email')}
        id="submit-contact-email"
        inputMode="email"
        label={t('submit.contact.email_label')}
        maxLength={CONTACT_MAX}
        type="email"
        value={draft.contactEmail}
        onChange={(event) => onChange({ contactEmail: event.target.value })}
      />
      <ValidatedInput
        error={errors.website && t('submit.errors.online_url')}
        id="submit-website"
        inputMode="url"
        label={t('submit.more.website_label')}
        maxLength={USER_SUBMISSION_VALUE_MAX}
        placeholder="https://"
        type="url"
        value={draft.website}
        onChange={(event) => onChange({ website: event.target.value })}
      />
    </>
  )
}

export function AboutFields({ draft, onChange }: Omit<FieldsProps, 'errors'>) {
  const { t } = useTranslation()

  return (
    <FormField htmlFor="submit-description" label={t('submit.about.description_label')}>
      <Textarea
        className="text-base md:text-sm"
        id="submit-description"
        maxLength={userSubmissionValueMax('message')}
        placeholder={t('submit.about.description_placeholder')}
        rows={6}
        value={draft.description}
        onChange={(event) => onChange({ description: event.target.value })}
      />
    </FormField>
  )
}

export function LanguageFields({
  draft,
  onChange,
  languageOptions,
}: Omit<FieldsProps, 'errors'> & { languageOptions: string[] }) {
  const { t } = useTranslation()
  const { languageLabel } = useLocale()
  const codes = useMemo(
    () => [...new Set([...draft.languages, ...languageOptions])],
    [draft.languages, languageOptions],
  )
  const options = useLanguageOptions(codes)

  return (
    <FormField label={t('submit.more.languages_label')}>
      <LanguageMultiSelect
        label={t('submit.more.languages_label')}
        options={options}
        triggerLabel={draft.languages.map(languageLabel).join(', ')}
        value={draft.languages}
        onChange={(languages) => onChange({ languages })}
      />
    </FormField>
  )
}
