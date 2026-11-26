/**
 * List-card distance formatting (issue #52): metres below 1 km, one decimal
 * below 10 km, integers above, and miles where that is the road-distance
 * convention (the US and the UK), with kilometres everywhere else. Values format
 * through `Intl.NumberFormat`'s unit style, so separators and unit labels
 * localize.
 */

const KM_PER_MILE = 1.609344

/**
 * Whether the locale's own region drives in miles. Only a stated region counts, so a bare `en`
 * reads kilometres; `regionalLocale` supplies the visitor's region (`en-GB`, `de-GB`).
 */
export const usesMiles = (locale: string): boolean => {
  const { region } = new Intl.Locale(locale)

  return region === 'US' || region === 'GB'
}

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

export function formatDistance(km: number, locale: string): string {
  if (usesMiles(locale)) {
    const miles = km / KM_PER_MILE

    return format(locale, miles, 'mile', miles < 10 ? 1 : 0)
  }

  // Sub-kilometre distances read better as metres, rounded to tens.
  if (km < 1) return format(locale, Math.round((km * 1000) / 10) * 10, 'meter', 0)

  return format(locale, km, 'kilometer', km < 10 ? 1 : 0)
}
