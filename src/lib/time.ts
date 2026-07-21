import { IANAZone, type DateTime } from 'luxon'

/**
 * Concise, locale-correct event times.
 *
 * Rather than hand-assembling "6 – 7 PM" (which breaks the moment a locale
 * prefers a 24-hour clock, a different range separator, or a suffix like
 * German's "Uhr"), this delegates to `Intl.DateTimeFormat.formatRange`, which
 * already collapses a shared day period onto the end of the range and renders
 * each locale's own convention:
 *
 * - en-US  → "6 – 7 PM"        (shared meridiem collapses)
 * - en-US  → "11:30 AM – 1:00 PM" (differing meridiems both show)
 * - de     → "18–19 Uhr"       (24-hour, localized suffix)
 *
 * The one thing Intl won't do is drop a `:00`, so we pick the option set: a
 * range whose endpoints both land on the hour formats without minutes, and any
 * range with real minutes keeps them on both ends (mixing them within a single
 * range isn't expressible through one formatter, and hand-splicing the parts
 * would reintroduce exactly the locale bugs this avoids).
 */
/**
 * Whether two instants read as the same wall-clock time — i.e. they share a UTC
 * offset at that moment, so converting between them changes nothing. Compares
 * the OFFSET rather than the zone id so it also catches distinct zones that
 * agree right now (Europe/London and Europe/Lisbon in winter), which is what
 * matters when deciding whether a "…in <region>" conversion adds any
 * information.
 */
export const sameWallClock = (a: DateTime | null, b: DateTime | null): boolean =>
  Boolean(a && b && a.offset === b.offset)

/**
 * The city an IANA zone is named for — "America/Vancouver" → "Vancouver".
 *
 * This is deliberately the *timezone's* city rather than a geolocated one: it
 * names the clock the time is being quoted in, it's always municipal-level (IP
 * geolocation swings between a neighbourhood and a whole province), and it
 * needs no lookup. The trade-off is that a zone names one representative city
 * for everyone in it, so a viewer in Munich sees "Berlin".
 */
export function zoneCity(zone: string | null | undefined): string {
  const city = zone?.split('/').pop()

  return city ? city.replace(/_/g, ' ') : ''
}

/**
 * The place name to attach to an online event's converted time, or null for the
 * safe bare-time form. The clock the time is quoted in is `at`'s own zone (the
 * viewer's OS zone); the region name comes from a *separate* source (IP
 * geolocation), so naming it is only honest when its zone shares that clock — i.e.
 * the same UTC offset at this instant (mirroring `sameWallClock`). When they
 * disagree (VPN, a traveller on home time, a mislocating IP DB) — or the region /
 * zone is missing or invalid — return null so the caller shows the bare converted
 * time with no place, never a region whose local time isn't the one shown (#64).
 */
export const reconciledViewerPlace = (
  region: string | null | undefined,
  zone: string | null | undefined,
  at: DateTime,
): string | null => {
  if (!region || !zone || !IANAZone.isValidZone(zone)) return null

  return at.setZone(zone).offset === at.offset ? region : null
}

export function formatTimeRange(start: DateTime, end: DateTime | null, locale: string): string {
  // Both endpoints are in the same (event) zone; format the instants in it.
  const timeZone = start.zoneName ?? undefined
  const onTheHour = start.minute === 0 && (end === null || end.minute === 0)

  const formatter = new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    ...(onTheHour ? {} : { minute: '2-digit' as const }),
    timeZone,
  })

  if (!end || +end === +start) return formatter.format(start.toJSDate())

  return formatter.formatRange(start.toJSDate(), end.toJSDate())
}
