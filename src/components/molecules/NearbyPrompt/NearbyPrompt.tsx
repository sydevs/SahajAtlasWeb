import { useTranslation } from 'react-i18next'

import { IconButton } from '@/components/atoms/Button'
import { CloseIcon, LocationIcon } from '@/components/atoms/Icons'

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
 * top-level views. The whole tinted card is one button into the distance-ranked
 * search; the corner × dismisses it. Framed as a *guess* — the copy says
 * "approximate location", never "your location".
 *
 * Deliberately NOT the `Alert` atom: this is a passive suggestion, not a status
 * message, so it borrows Alert's `secondary` tint tokens but avoids Alert's
 * assertive `role="alert"` live region (which would interrupt a screen reader).
 * Presentational only — the IP lookup, session-scoped dismissal, and navigation
 * live in `NearbySuggestion` (src/views/shared.tsx).
 */
export function NearbyPrompt({ city, onSelect, onDismiss }: NearbyPromptProps) {
  const { t } = useTranslation('common')

  return (
    <div className="relative mb-3">
      <button
        className="flex w-full items-start gap-3 rounded bg-secondary-3 p-3 pr-10 text-left text-secondary-11 transition-colors hover:bg-secondary-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        type="button"
        onClick={onSelect}
      >
        <LocationIcon className="mt-0.5 shrink-0" size={20} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{t('nearby_prompt.title', { city })}</span>
          <span className="block text-sm opacity-90">{t('nearby_prompt.subtitle')}</span>
        </span>
      </button>
      <IconButton
        aria-label={t('nearby_prompt.dismiss')}
        className="absolute right-1 top-1"
        onClick={onDismiss}
      >
        <CloseIcon size={16} />
      </IconButton>
    </div>
  )
}
