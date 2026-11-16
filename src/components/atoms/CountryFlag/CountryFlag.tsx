import { flagUrl } from '@/lib/flag-url'

export interface CountryFlagProps {
  /** ISO 3166-1 alpha-2, either case. */
  countryCode: string
  className?: string
}

/**
 * A round country flag served from the widget's own origin (`lib/flag-url.ts`). Decorative:
 * the country's name is always printed beside it, and `referrerPolicy="no-referrer"` keeps the
 * host page's URL out of the request.
 */
export function CountryFlag({ countryCode, className }: CountryFlagProps) {
  const src = flagUrl(countryCode)

  if (!src) return null

  return (
    <img
      alt=""
      className={className}
      decoding="async"
      loading="lazy"
      referrerPolicy="no-referrer"
      src={src}
    />
  )
}
