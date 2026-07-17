/**
 * List-card distance formatting (issue #52): metres below 1 km, one decimal
 * below 10 km, integers above — and miles where that's the road-distance
 * convention (en-US / en-GB), kilometres everywhere else. Values format through
 * `Intl.NumberFormat`'s unit style so separators and unit labels localize.
 */

const MILE_LOCALES = new Set(['en-us', 'en-gb'])
const KM_PER_MILE = 1.609344

export const usesMiles = (locale: string): boolean => MILE_LOCALES.has(locale.toLowerCase())

const format = (locale: string, value: number, unit: string, maximumFractionDigits: number) =>
  new Intl.NumberFormat(locale, {
    style: 'unit',
    unit,
    unitDisplay: 'short',
    maximumFractionDigits,
  }).format(value)

export function formatDistance(km: number, locale: string): string {
  if (usesMiles(locale)) {
    const miles = km / KM_PER_MILE

    return format(locale, miles, 'mile', miles < 10 ? 1 : 0)
  }

  // Sub-kilometre distances read better as metres, rounded to tens.
  if (km < 1) return format(locale, Math.round((km * 1000) / 10) * 10, 'meter', 0)

  return format(locale, km, 'kilometer', km < 10 ? 1 : 0)
}
