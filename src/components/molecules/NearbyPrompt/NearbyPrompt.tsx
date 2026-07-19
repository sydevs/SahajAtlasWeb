import { useTranslation } from 'react-i18next'

import { Alert } from '@/components/atoms/Alert'
import { LocationIcon } from '@/components/atoms/Icons'

export type NearbyPromptProps = {
  /** The IP-guessed city, interpolated into the prompt's question. */
  city: string
  /** Accept the suggestion — navigate into the distance-ranked nearby search. */
  onAccept: () => void
  /** Dismiss the suggestion for the rest of the session. */
  onClose: () => void
}

/**
 * The dismissible "events near you" suggestion shown above the list on the
 * top-level views: a single-line, primary-tinted `Alert` whose text is a button
 * into the distance-ranked search, with the Alert's × dismissing it for the
 * session. Announced politely (`role="status"`), not as an assertive alert — it's a
 * passive guess. Framed as a *guess* — "Looking for classes near %{city}?", never
 * "your location". Presentational only — the IP lookup, session-scoped dismissal,
 * and navigation live in `NearbySuggestion` (src/views/shared.tsx).
 */
export function NearbyPrompt({ city, onAccept, onClose }: NearbyPromptProps) {
  const { t } = useTranslation('common')

  // `px-4` matches the drawer header's horizontal padding so the prompt's icon/text
  // line up with the header content; the slim `sm` size keeps the vertical padding.
  return (
    <Alert
      className="px-4"
      closeLabel={t('nearby_prompt.dismiss')}
      color="primary"
      icon={<LocationIcon size={18} />}
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
