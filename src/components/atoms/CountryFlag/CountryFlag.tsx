import { flagUrl } from '@/lib/flag-url'

export interface CountryFlagProps {
  /** ISO 3166-1 alpha-2, either case. */
  countryCode: string
  className?: string
}

/**
 * A round country flag served from the widget's own origin (`lib/flag-url.ts`). Decorative:
 * the country's name is always printed beside it. `referrerPolicy` stays `no-referrer` so the
 * host page's URL is never sent with the request, as it was when flags came from a third party.
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
