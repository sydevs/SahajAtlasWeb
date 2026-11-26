/**
 * The one place a date or a time becomes words: an `Intl` format in the locale `regionalLocale`
 * picks. The order, separators, clock and day periods are Intl's data, never assembled by hand.
 */
import { DateTime, Info } from 'luxon'

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

// One formatter per locale for the widget's lifetime: a results page formats a time per row.
const clocks = new Map<string, Intl.DateTimeFormat>()

const clock = (locale: string): Intl.DateTimeFormat => {
  let found = clocks.get(locale)

  if (!found) {
    // `timeStyle: 'short'` is the locale's everyday time, as `toLocaleTimeString` writes it.
    found = new Intl.DateTimeFormat(locale, { timeStyle: 'short', timeZone: 'UTC' })
    clocks.set(locale, found)
  }

  return found
}

/**
 * Event times in the locale's own clock, through `formatRange`, which collapses a shared day
 * period onto the end ("6:00 – 7:00 PM") and keeps each locale's separator and suffix
 * ("18:00–19:00 Uhr").
 *
 * Both endpoints are read in the start's zone — a caller may hand over either — and pinned to one
 * calendar day, so an overnight range keeps its locale's hour-range pattern instead of widening
 * into two full dates (`wallClockOnOneDay`).
 */
export function formatTimeRange(start: DateTime, end: DateTime | null, locale: string): string {
  const endInZone = end?.setZone(start.zone) ?? null
  const formatter = clock(locale)
  const from = wallClockOnOneDay(start)

  if (!endInZone || +endInZone === +start) return formatter.format(from)

  const to = wallClockOnOneDay(endInZone)
  const parts = formatter.formatRangeToParts(from, to)

  // A range that wraps past midnight and runs twelve hours or more (5 PM to noon) has one day
  // period at both ends, and `formatRange` writes it once: "5:00 – 12:00 PM" reads as a morning
  // start. Each end is then written whole, joined by the locale's own mark.
  if (+to < +from && parts.filter((part) => part.type === 'dayPeriod').length === 1) {
    const endsAt = parts.findIndex((part) => part.source === 'endRange')

    return `${formatter.format(from)}${parts[endsAt - 1]?.value ?? ' – '}${formatter.format(to)}`
  }

  return parts.map((part) => part.value).join('')
}

/** The hour a time-of-day filter stands for, to format like any class's time. Hour 24 is midnight. */
export const wallClock = (hour: number): DateTime => DateTime.utc(2000, 1, 1, hour % 24)

/**
 * A date the way the class page writes it: "Wed 11 Nov" on a UK browser, "Wed, Nov 11" on a US
 * one. `weekday: false` drops the day name where the words around it already say it ("Started 8
 * Jul"). The year joins only when it is not this year's, so a series that began in 2022 does not
 * pass for this December.
 */
export function formatDate(
  at: DateTime,
  locale: string,
  { weekday = true }: { weekday?: boolean } = {},
): string {
  return at.setLocale(locale).toLocaleString({
    weekday: weekday ? 'short' : undefined,
    day: 'numeric',
    month: 'short',
    year: at.year === DateTime.now().setZone(at.zone).year ? undefined : 'numeric',
  })
}

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
 * How far off a date is, counted in `unit`, to lead a phrase: "Today", "Next week", "In 2 weeks".
 * Intl writes these words to sit mid-sentence, so only the first letter is raised.
 */
export function formatRelativeDate(
  at: DateTime,
  locale: string,
  unit?: 'days' | 'weeks' | 'months',
): string {
  const words = at.setLocale(locale).toRelativeCalendar({ unit }) ?? ''

  return words.charAt(0).toLocaleUpperCase(locale) + words.slice(1)
}

/**
 * `language` in a browser locale's region, on that locale's clock: `en-CZ` for cs-CZ. CLDR has no
 * English for some regions, and one it lacks (`en-BR`) falls back to US English and its 12-hour
 * clock, so the clock is then stated outright (`en-BR-u-hc-h23`). Null for a tag Intl refuses.
 */
const inBrowserRegion = (language: string, browser: string): string | null => {
  try {
    const { region } = new Intl.Locale(browser).maximize()
    const tag = region ? `${language}-${region}` : language
    const hourCycle = (of: string) =>
      new Intl.DateTimeFormat(of, { hour: 'numeric' }).resolvedOptions().hourCycle
    const browserCycle = hourCycle(browser)

    return browserCycle && hourCycle(tag) !== browserCycle ? `${tag}-u-hc-${browserCycle}` : tag
  } catch {
    return null
  }
}

// Asked per card on every render, and each answer builds two Intl formatters.
const regional = new Map<string, string>()

/**
 * The locale to format dates and times in. The browser's FIRST language decides, as it does for
 * `toLocaleTimeString()`: en-GB or en-US as given, and for a browser whose first language is
 * another, the page's language in that browser's region and on its clock (`inBrowserRegion`).
 * An English entry further down says nothing about the visitor's clock: Chrome and Firefox list
 * en-US after the visitor's own language by default.
 */
export function regionalLocale(
  locale: string,
  // An older webview has `navigator` but no `languages`.
  browserLocales: readonly string[] = typeof navigator === 'undefined'
    ? []
    : (navigator.languages ?? []),
): string {
  const language = locale.split('-')[0].toLowerCase()
  const [first] = browserLocales

  if (!first) return locale
  if (first.split('-')[0].toLowerCase() === language) return first

  const key = `${locale}|${first}`
  let found = regional.get(key)

  if (found === undefined) {
    found = inBrowserRegion(language, first) ?? locale
    regional.set(key, found)
  }

  return found
}

// Schedule-X validates `locale` against its own supported BCP-47 set, and THROWS
// (`InvalidLocaleError`) on an unknown code — this project's short `en`/`de`/… crash it. This
// maps this project's locales to the closest one SX ships. Hungarian, which SX lacks, falls
// back to en-US chrome. This project's own header stays fully localized via i18n.
const SCHEDULE_X_LOCALES: Record<string, string> = {
  de: 'de-DE',
  fr: 'fr-FR',
  es: 'es-ES',
  cs: 'cs-CZ',
  nl: 'nl-NL',
  ru: 'ru-RU',
  uk: 'uk-UA',
  // Schedule-X ships Brazilian Portuguese only, so every Portuguese browser runs it (`pt-PT`).
  pt: 'pt-BR',
}

/** Whether `locale` writes the day before the month, as en-GB does and en-US does not. */
const dayFirst = (locale: string): boolean => {
  const order = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' })
    .formatToParts(0)
    .map((part) => part.type)

  return order.indexOf('day') < order.indexOf('month')
}

/**
 * The Schedule-X locale for a locale tag: the exact tag, then its base language, so a `de-AT` or
 * `fr-CA` browser (see `regionalLocale`) keeps calendar labels in its own language. A regional
 * English runs as en-GB or en-US by its date order, so the grid's dates read like the lists'
 * (`en-CZ` and `en-AU` day first, `en-CA` month first).
 */
export const scheduleXLocale = (locale: string): string => {
  const language = locale.split('-')[0].toLowerCase()

  if (language === 'en') return dayFirst(locale) ? 'en-GB' : 'en-US'

  return SCHEDULE_X_LOCALES[locale] ?? SCHEDULE_X_LOCALES[language] ?? 'en-US'
}
