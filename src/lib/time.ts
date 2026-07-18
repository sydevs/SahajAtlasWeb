import type { DateTime } from 'luxon'

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
