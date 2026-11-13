/**
 * List-card distance formatting (issue #52): metres below 1 km, one decimal
 * below 10 km, integers above, and miles where that is the road-distance
 * convention (en-US / en-GB), with kilometres everywhere else. Values format
 * through `Intl.NumberFormat`'s unit style, so separators and unit labels
 * localize.
 */

const MILE_LOCALES = new Set(['en-us', 'en-gb'])
const KM_PER_MILE = 1.609344

export const usesMiles = (locale: string): boolean => MILE_LOCALES.has(locale.toLowerCase())

// Intl.NumberFormat construction is the expensive part (~0.1 ms) and this runs
// per card in a 50-row results list — cache formatters per locale/unit/digits
// (the same pattern luxon uses for its Intl objects).
const formatters = new Map<string, Intl.NumberFormat>()

const format = (locale: string, value: number, unit: string, maximumFractionDigits: number) => {
  const key = `${locale}|${unit}|${maximumFractionDigits}`
  let formatter = formatters.get(key)

  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      style: 'unit',
      unit,
      unitDisplay: 'short',
      maximumFractionDigits,
    })
    formatters.set(key, formatter)
  }

  return formatter.format(value)
}

type Measure = { value: number; unit: 'mile' | 'meter' | 'kilometer'; digits: number }

const measure = (km: number, locale: string): Measure => {
  if (usesMiles(locale)) {
    const miles = km / KM_PER_MILE

    return { value: miles, unit: 'mile', digits: miles < 10 ? 1 : 0 }
  }

  // Sub-kilometre distances read better as metres, rounded to tens.
  if (km < 1) return { value: Math.round((km * 1000) / 10) * 10, unit: 'meter', digits: 0 }

  return { value: km, unit: 'kilometer', digits: km < 10 ? 1 : 0 }
}

export function formatDistance(km: number, locale: string): string {
  const { value, unit, digits } = measure(km, locale)

  return format(locale, value, unit, digits)
}

/** Whether `formatDistance` would write zero ("0 mi", "0 m"), which says nothing about how far. */
export const roundsToZero = (km: number, locale: string): boolean => {
  const { value, digits } = measure(km, locale)

  return Math.round(value * 10 ** digits) === 0
}
