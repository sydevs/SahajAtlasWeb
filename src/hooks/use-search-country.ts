import { useSearchParams } from 'react-router'

import { SEARCH_COUNTRY_PARAM, isoCountryCode } from '@/lib/shape'

/**
 * This returns the country the current search landed in, `?cc`, written by the geocoder field or an accepted IP suggestion, normalized to canonical uppercase alpha-2.
 * It returns `undefined` on every surface but `/search`, and for an ocean or country-less feature.
 *
 * This value rides in the URL because it cannot be re-derived.
 * A country with no programs has no feed features, so there is no geometry to resolve the search point against.
 *
 * Two consumers read this, for different reasons.
 * The results list tightens its distance boundary for events across a border from here, in `revealRows`.
 * The empty state offers this country's own website when it lists no programs at all, in `useCountrySite`.
 */
export const useSearchCountry = (): string | undefined => {
  const [searchParams] = useSearchParams()

  return isoCountryCode(searchParams.get(SEARCH_COUNTRY_PARAM))
}
