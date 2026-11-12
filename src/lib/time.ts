/**
 * The one place a date or a time becomes words. Every formatter here goes through the browser's
 * `Intl` formats in the locale it is given (`regionalLocale`'s answer), so each visitor reads the
 * pattern familiar where they are: "7:30 PM" and "Fri, Nov 12" in the US, "19:30" and "Fri 12 Nov"
 * in the UK, "19:30" and "Fr., 12. Nov." in Germany. Never assemble a clock, a day period or a
 * date by hand, or force one locale's clock on another: the order, separators and suffixes are
 * Intl's data, not ours.
 */
import { DateTime, Info } from 'luxon'

/** The visitor's own IANA zone, UTC where the runtime cannot name one. */
export const viewerTimeZone = (): string => DateTime.local().zoneName ?? 'UTC'

/**
 * Whether two instants read as the same wall-clock time — i.e. they share a UTC
 * offset at that moment, so converting between them changes nothing. Compares
 * the OFFSET rather than the zone id so it also catches distinct zones that
 * agree right now (Europe/London and Europe/Lisbon in winter), which is what
 * matters when deciding whether a "…in <city>" conversion adds any
 * information.
 */
export const sameWallClock = (a: DateTime | null, b: DateTime | null): boolean =>
  Boolean(a && b && a.offset === b.offset)

/**
 * The city an IANA zone is named for — "America/Vancouver" → "Vancouver".
 *
 * This is deliberately the *timezone's* city, instead of a geolocated one.
 * It names the clock the time is being quoted in, and it is always
 * municipal-level (IP geolocation swings between a neighbourhood and a
 * whole province), and it needs no lookup. The trade-off is that a zone
 * names one representative city for everyone in it, so a viewer in Munich
 * sees "Berlin".
 */
export function zoneCity(zone: string | null | undefined): string {
  const city = zone?.split('/').pop()

  return city ? city.replace(/_/g, ' ') : ''
}

/**
 * An instant's wall clock, re-pinned to one fixed calendar day.
 *
 * `formatRange` widens its pattern to a full date on each end as soon as the two
 * instants fall on different calendar days, and no option turns that off (#325).
 * An occurrence spans at most one night (`withEndTime`), so those dates say
 * nothing. The day is in UTC, where no transition can swallow the wall clock it
 * carries.
 *
 * An overnight range therefore reaches `formatRange` with its start later than
 * its end — pinned 21:30 against pinned 00:30. No spec or MDN text covers that
 * pair, but every locale checked renders it in the order given. Do not "fix" it:
 * re-dating the end restores the day boundary, and swapping the arguments prints
 * the range backwards.
 */
const wallClockOnOneDay = (at: DateTime): Date => new Date(Date.UTC(2000, 0, 1, at.hour, at.minute))

const HOUR_MS = 3_600_000

type Clock = { formatter: Intl.DateTimeFormat; separator: string }

// One formatter per locale for the widget's lifetime: a week list or a results page formats a
// time per row, and the result depends on nothing but the locale.
const clocks = new Map<string, Clock>()

/** The locale's own mark between two times, read off a range Intl writes itself. */
const rangeSeparator = (formatter: Intl.DateTimeFormat): string => {
  const parts = formatter.formatRangeToParts(
    new Date(Date.UTC(2000, 0, 1, 9)),
    new Date(Date.UTC(2000, 0, 1, 17)),
  )
  const between = parts[parts.findIndex((part) => part.source === 'endRange') - 1]

  return between?.source === 'shared' ? between.value : ' – '
}

const clock = (locale: string): Clock => {
  let found = clocks.get(locale)

  if (!found) {
    // `timeStyle: 'short'` is the locale's own everyday time, as `toLocaleTimeString` writes it:
    // the clock, the day period and its case are Intl's choice for that locale, never ours.
    const formatter = new Intl.DateTimeFormat(locale, { timeStyle: 'short', timeZone: 'UTC' })

    found = { formatter, separator: rangeSeparator(formatter) }
    clocks.set(locale, found)
  }

  return found
}

/**
 * Event times in the locale's own clock.
 *
 * Rather than hand-assembling "6 – 7 PM" (which breaks the moment a locale
 * prefers a 24-hour clock, a different range separator, or a suffix like
 * German's "Uhr"), this delegates to `Intl.DateTimeFormat.formatRange`, which
 * already collapses a shared day period onto the end of the range and renders
 * each locale's own convention:
 *
 * - en-US  → "6:00 – 7:00 PM"  (shared meridiem collapses)
 * - en-US  → "11:30 AM – 1:00 PM" (differing meridiems both show)
 * - en-GB  → "18:00–19:00"     (the region's 24-hour clock)
 * - de     → "18:00–19:00 Uhr" (24-hour, localized suffix)
 *
 * Both endpoints are read in the start's zone — a caller may hand over either
 * — and pinned to one calendar day, so an overnight range keeps its
 * locale's hour-range pattern instead of widening into two full dates
 * (`wallClockOnOneDay`).
 */
export function formatTimeRange(start: DateTime, end: DateTime | null, locale: string): string {
  const endInZone = end?.setZone(start.zone) ?? null
  const { formatter, separator } = clock(locale)
  const from = wallClockOnOneDay(start)

  if (!endInZone || +endInZone === +start) return formatter.format(from)

  const to = wallClockOnOneDay(endInZone)

  // A range that wraps past midnight and runs twelve hours or more (an evening-and-morning filter,
  // 5 PM to noon) has the same day period at both ends, and `formatRange` writes it once: "5:00 –
  // 12:00 PM" reads as a morning start. So each end is written whole.
  if (+to < +from && +from - +to <= 12 * HOUR_MS)
    return `${formatter.format(from)}${separator}${formatter.format(to)}`

  return formatter.formatRange(from, to)
}

/** One time, as `formatTimeRange` writes it: "7:30 PM" in the US, "19:30" in the UK. */
export const formatTime = (at: DateTime, locale: string): string =>
  formatTimeRange(at, null, locale)

/**
 * A wall-clock time that belongs to no instant — an `HH:mm` typed into a form, the hour a filter
 * stands for — to format like any class's time. Hour 24 is midnight.
 */
export const wallClock = (hour: number, minute = 0): DateTime =>
  DateTime.utc(2000, 1, 1, hour % 24, minute)

type DateOptions = { now?: DateTime }

// The year joins only when it is not this year's, so a series that began in 2022 reads
// "21 Dec 2022" instead of passing for this December.
const yearUnlessThisOne = (at: DateTime, now: DateTime): Intl.DateTimeFormatOptions =>
  at.year === now.setZone(at.zone).year ? {} : { year: 'numeric' }

/**
 * A date the way the class page writes it: "Wed 11 Nov" on a UK browser, "Wed, Nov 11" on a US
 * one. `weekday: false` drops the day name where the words around it already say it ("Every
 * Wednesday from 11 Nov", "Started 8 Jul").
 */
export function formatDate(
  at: DateTime,
  locale: string,
  { weekday = true, now = DateTime.now() }: DateOptions & { weekday?: boolean } = {},
): string {
  return at.setLocale(locale).toLocaleString({
    ...(weekday ? { weekday: 'short' } : {}),
    day: 'numeric',
    month: 'short',
    ...yearUnlessThisOne(at, now),
  })
}

/** A day as a heading: "Friday, Nov 12" in the US, "Friday 12 Nov" in the UK. */
export const formatDayHeading = (
  at: DateTime,
  locale: string,
  { now = DateTime.now() }: DateOptions = {},
): string =>
  at.setLocale(locale).toLocaleString({
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    ...yearUnlessThisOne(at, now),
  })

/** A date in full words: "Tuesday, November 10" in the US, "Tuesday 10 November" in the UK. */
export const formatLongDate = (
  at: DateTime,
  locale: string,
  { now = DateTime.now() }: DateOptions = {},
): string =>
  at.setLocale(locale).toLocaleString({
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...yearUnlessThisOne(at, now),
  })

/** A weekday's name: "Wednesday", or "Wed" when `short`. */
export const formatWeekday = (
  at: DateTime,
  locale: string,
  width: 'long' | 'short' = 'long',
): string => at.setLocale(locale).toLocaleString({ weekday: width })

/** The seven weekday names, Monday first, so an ISO weekday `n` is `[n - 1]`: "Mon", "Tue"… */
export const weekdayNames = (locale: string, width: 'long' | 'short' = 'long'): string[] =>
  Info.weekdays(width, { locale })

/** A month and its year: "November 2026". */
export const formatMonth = (at: DateTime, locale: string): string =>
  at.setLocale(locale).toLocaleString({ month: 'long', year: 'numeric' })

/**
 * A run of calendar days: "12–18 Nov" in the UK, "Nov 12 – 18" in the US, "30 Nov – 6 Dec" across
 * a month. Each end is read as its calendar date, whatever zone it is in.
 */
export const formatDateRange = (start: DateTime, end: DateTime, locale: string): string =>
  new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).formatRange(
    Date.UTC(start.year, start.month - 1, start.day),
    Date.UTC(end.year, end.month - 1, end.day),
  )

/**
 * How far off a date is, counted in `unit`, to lead a phrase: "Today", "Next week", "In 2 weeks".
 * Intl writes these words to sit mid-sentence, so only the first letter is raised.
 */
export function formatRelativeDate(
  at: DateTime,
  locale: string,
  unit?: 'days' | 'weeks' | 'months',
): string {
  const words = at.setLocale(locale).toRelativeCalendar(unit ? { unit } : undefined) ?? ''

  return words.charAt(0).toLocaleUpperCase(locale) + words.slice(1)
}

/**
 * A zone as a person names it — "United Kingdom Time", "Central European Time" — in `locale`,
 * falling back to the IANA id where the runtime has no generic name for it.
 */
export function zoneLabel(zone: string, locale: string, at: Date = new Date()): string {
  try {
    const name = new Intl.DateTimeFormat(locale, { timeZone: zone, timeZoneName: 'longGeneric' })
      .formatToParts(at)
      .find((part) => part.type === 'timeZoneName')?.value

    // A zone with no generic name formats as an offset ("GMT+03:00"), which says less than its id.
    return name && !/^GMT[+-]/.test(name) ? name : zone
  } catch {
    return zone
  }
}

/**
 * The locale to format dates and times in: the visitor's own regional variant when its language
 * is the one on screen, so an English page reads "Tue, 10 Nov" and "19:30" for a browser set to
 * en-GB, and "Tue, Nov 10" and "7:30 PM" for en-US. The interface's language alone says nothing
 * about the region. A browser in another language keeps the interface's own format, since
 * mixing a French date pattern into an English sentence would read worse.
 */
export function regionalLocale(
  locale: string,
  browserLocales: readonly string[] = typeof navigator === 'undefined' ? [] : navigator.languages,
): string {
  const language = locale.split('-')[0].toLowerCase()
  const match = browserLocales.find((tag) => tag.split('-')[0].toLowerCase() === language)

  return match ?? locale
}

// Schedule-X validates `locale` against its own supported BCP-47 set, and THROWS
// (`InvalidLocaleError`) on an unknown code — this project's short `en`/`de`/… crash it. This
// maps this project's locales to the closest one SX 2.36 ships. Hungarian, which SX lacks, falls
// back to en-US chrome. This project's own header stays fully localized via i18n.
const SCHEDULE_X_LOCALES: Record<string, string> = {
  en: 'en-US',
  'en-GB': 'en-GB',
  'en-AU': 'en-GB',
  de: 'de-DE',
  fr: 'fr-FR',
  es: 'es-ES',
  cs: 'cs-CZ',
  nl: 'nl-NL',
  ru: 'ru-RU',
  uk: 'uk-UA',
  'pt-BR': 'pt-BR',
}

/**
 * The Schedule-X locale for a locale tag: the exact tag, then its base language, so a `de-AT` or
 * `fr-CA` browser (see `regionalLocale`) keeps calendar labels in its own language.
 */
export const scheduleXLocale = (locale: string): string =>
  SCHEDULE_X_LOCALES[locale] ?? SCHEDULE_X_LOCALES[locale.split('-')[0].toLowerCase()] ?? 'en-US'

/**
 * The name Schedule-X files a locale's strings under: its code without the hyphen (`en-GB` →
 * `enGB`). A `translations` config REPLACES Schedule-X's built-in table instead of adding to it,
 * and a locale with no entry there shows its raw keys ("+ {{n}} events"). So an override has to
 * sit under the exact code the calendar runs in, which follows the visitor's region.
 */
export const scheduleXTranslationKey = (scheduleXCode: string): string =>
  scheduleXCode.replaceAll('-', '')
