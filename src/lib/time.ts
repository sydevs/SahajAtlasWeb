import type { DateTime } from 'luxon'

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

/**
 * Concise, locale-correct event times.
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
 * Minutes always show, so every time on screen has one shape ("5:00 PM", "7:30 PM",
 * "5:00 – 6:30 PM") rather than mixing "5 PM" with "5:00 – 6:30 PM".
 *
 * Both endpoints are read in the start's zone — a caller may hand over either
 * — and pinned to one calendar day, so an overnight range keeps its
 * locale's hour-range pattern instead of widening into two full dates
 * (`wallClockOnOneDay`).
 */
export function formatTimeRange(start: DateTime, end: DateTime | null, locale: string): string {
  const endInZone = end?.setZone(start.zone) ?? null

  const formatter = new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
    // English always says am or pm, even where the region's clock is 24-hour (en-GB): "4:00"
    // alone could be morning or afternoon (Anton, 6 Nov). Other languages keep their own clock.
    ...(isEnglish(locale) ? { hour12: true } : {}),
  })

  if (!endInZone || +endInZone === +start) return formatter.format(wallClockOnOneDay(start))

  return formatter.formatRange(wallClockOnOneDay(start), wallClockOnOneDay(endInZone))
}

const isEnglish = (locale: string): boolean => locale.split('-')[0].toLowerCase() === 'en'

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
