import { useTranslation } from 'react-i18next'

import { Alert } from '@/components/atoms/Alert'
import { LocationIcon } from '@/components/atoms/Icons'

export type NearbyPromptProps = {
  /** The IP-guessed city, interpolated into the prompt's question. */
  city: string
  /** Accept the suggestion — navigate into the distance-ranked nearby search. */
  onSelect: () => void
  /** Dismiss the suggestion for the rest of the session. */
  onDismiss: () => void
}

/**
 * The dismissible "events near you" suggestion shown above the list on the
 * top-level views: a single-line, primary-tinted `Alert` whose text is a button
 * into the distance-ranked search, with the Alert's × dismissing it for the
 * session. Framed as a *guess* — "Looking for classes near %{city}?", never "your
 * location". Presentational only — the IP lookup, session-scoped dismissal, and
 * navigation
 * live in `NearbySuggestion` (src/views/shared.tsx).
 */
export function NearbyPrompt({ city, onSelect, onDismiss }: NearbyPromptProps) {
  const { t } = useTranslation('common')

  return (
    <Alert
      className="mb-3"
      closeLabel={t('nearby_prompt.dismiss')}
      color="primary"
      icon={<LocationIcon size={18} />}
      size="sm"
      title={
        <button
          className="w-full text-left hover:underline focus:outline-none focus-visible:underline"
          type="button"
          onClick={onSelect}
        >
          {t('nearby_prompt.title', { city })}
        </button>
      }
      onClose={onDismiss}
    />
  )
}
