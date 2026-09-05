import { useTranslation } from 'react-i18next'
import { MapPin } from 'lucide-react'

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
 * top-level views: a single-line, secondary-tinted `Alert` whose text is a
 * button into the distance-ranked search. The Alert's × dismisses it for
 * the session. It announces politely (`role="status"`), not as an
 * assertive alert, since it is a passive guess. It is framed as a *guess*:
 * "Looking for classes near %{city}?", never "your location". This is
 * presentational only. The IP lookup, session-scoped dismissal, and
 * navigation live in `GeolocationSuggestion` (src/views/shared.tsx).
 */
export function GeolocationPrompt({ city, onAccept, onClose }: GeolocationPromptProps) {
  const { t } = useTranslation('common')

  // `px-4` matches the drawer header's horizontal padding, so the
  // prompt's icon and text line up with the header content. The slim `sm`
  // size keeps the vertical padding.
  return (
    <Alert
      className="px-4"
      closeLabel={t('nearby_prompt.dismiss')}
      color="secondary"
      icon={<MapPin size={18} />}
      role="status"
      size="sm"
      title={
        <button
          className="w-full text-start hover:underline focus:outline-none focus-visible:underline"
          type="button"
          onClick={onAccept}
        >
          {t('nearby_prompt.title', { city })}
        </button>
      }
      onClose={onClose}
    />
  )
}
