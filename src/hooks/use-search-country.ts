import { useSearchParams } from 'react-router'

import { SEARCH_COUNTRY_PARAM, isoCountryCode } from '@/lib/shape'

/**
 * The country the current search landed in (`?cc`, written by the geocoder field / an
 * accepted IP suggestion), normalized to canonical uppercase alpha-2 — or `undefined`
 * on every surface but `/search`, and for an ocean or country-less feature.
 *
 * It rides in the URL because it can't be re-derived: a country with no programs has no
 * feed features, so there's no geometry to resolve the search point against.
 *
 * Two consumers, for different reasons: the results list tightens its distance boundary
 * for events across a border from here (`revealRows`), and the empty state offers this
 * country's own website when it lists no programs at all (`useCountrySite`).
 */
export const useSearchCountry = (): string | undefined => {
  const [searchParams] = useSearchParams()

  return isoCountryCode(searchParams.get(SEARCH_COUNTRY_PARAM))
}
