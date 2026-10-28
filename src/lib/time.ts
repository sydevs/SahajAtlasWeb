import { DateTime, IANAZone } from 'luxon'

/** The visitor's own IANA zone, UTC where the runtime cannot name one. */
export const viewerTimeZone = (): string => DateTime.local().zoneName ?? 'UTC'

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
 * The place name to attach to an online event's converted time, or null for
 * the safe bare-time form. The clock the time is quoted in is `at`'s own
 * zone (the viewer's OS zone). The region name comes from a *separate*
 * source (IP geolocation), so naming it is only honest when its zone shares
 * that clock: the same UTC offset at this instant (mirroring
 * `sameWallClock`). When they disagree (VPN, a traveller on home time, a
 * mislocating IP DB), or the region or zone is missing or invalid, this
 * returns null. The caller then shows the bare converted time with no
 * place, never a region whose local time is not the one shown (#64).
 */
export const reconciledViewerPlace = (
  region: string | null | undefined,
  zone: string | null | undefined,
  at: DateTime,
): string | null => {
  if (!region || !zone || !IANAZone.isValidZone(zone)) return null

  return at.setZone(zone).offset === at.offset ? region : null
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
 * - en-US  → "6 – 7 PM"        (shared meridiem collapses)
 * - en-US  → "11:30 AM – 1:00 PM" (differing meridiems both show)
 * - de     → "18–19 Uhr"       (24-hour, localized suffix)
 *
 * One thing Intl will not do is drop a `:00`, so this picks the option
 * set: a range whose endpoints both land on the hour formats without
 * minutes, and any range with real minutes keeps them on both ends (mixing
 * them within a single range is not expressible through one formatter, and
 * hand-splicing the parts would reintroduce exactly the locale bugs this
 * avoids).
 *
 * Both endpoints are read in the start's (the event's) zone — a caller may hand
 * over either — and pinned to one calendar day, so an overnight range keeps its
 * locale's hour-range pattern instead of widening into two full dates
 * (`wallClockOnOneDay`).
 */
export function formatTimeRange(start: DateTime, end: DateTime | null, locale: string): string {
  const endInZone = end?.setZone(start.zone) ?? null
  const onTheHour = start.minute === 0 && (endInZone === null || endInZone.minute === 0)

  const formatter = new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    ...(onTheHour ? {} : { minute: '2-digit' as const }),
    timeZone: 'UTC',
  })

  if (!endInZone || +endInZone === +start) return formatter.format(wallClockOnOneDay(start))

  return formatter.formatRange(wallClockOnOneDay(start), wallClockOnOneDay(endInZone))
}
