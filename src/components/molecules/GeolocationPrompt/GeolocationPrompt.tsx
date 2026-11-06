import { useTranslation } from 'react-i18next'
import { ChevronRight, MapPin } from 'lucide-react'

import { Alert } from '@/components/atoms/Alert'

export type GeolocationPromptProps = {
  /** The IP-guessed city, interpolated into the prompt's question. */
  city: string
  /** Accept the suggestion. This navigates into the distance-ranked nearby search. */
  onAccept: () => void
  /** Dismiss the suggestion for the rest of the session. */
  onClose: () => void
}

/**
 * The dismissible "events near you" suggestion shown above the list on the
 * top-level views: a single-line, light-blue (secondary) band whose text is a
 * button into the distance-ranked search. The Alert's × dismisses it for
 * the session. It announces politely (`role="status"`), not as an
 * assertive alert, since it is a passive guess. It is framed as a *guess*:
 * "Classes near %{city}", never "your location". This is
 * presentational only. The IP lookup, session-scoped dismissal, and
 * navigation live in `GeolocationSuggestion` (src/views/shared.tsx). It carries no second link:
 * a country-website line under it was too small to tap on a phone, and Anton didn't want it.
 */
export function GeolocationPrompt({ city, onAccept, onClose }: GeolocationPromptProps) {
  const { t } = useTranslation()

  // Today's full-width light-blue band, which Anton preferred to an inset sand box (6 Nov):
  // the box sat between the search field and the list and lined up with neither. The band
  // runs edge to edge; `px-4` puts the pin on the panel's 16px edge, where the rows' text
  // starts, and the × in the column of the rows' chevrons. Not the coral tint: a pink band
  // read like an error.
  return (
    <Alert
      className="mt-2 gap-2.5 rounded-none px-4"
      closeLabel={t('search.nearby_prompt.dismiss')}
      color="secondary"
      icon={<MapPin size={18} />}
      role="status"
      size="sm"
      title={
        <button
          className="touch-target relative flex w-full items-center gap-1 text-start hover:underline focus:outline-none focus-visible:underline"
          type="button"
          onClick={onAccept}
        >
          {t('countries.near_city', { city })}
          <ChevronRight aria-hidden className="shrink-0 rtl:-scale-x-100" size={16} />
        </button>
      }
      onClose={onClose}
    />
  )
}
