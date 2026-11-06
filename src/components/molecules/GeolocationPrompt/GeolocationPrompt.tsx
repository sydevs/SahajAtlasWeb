import { useTranslation } from 'react-i18next'
import { ChevronRight, MapPin, X } from 'lucide-react'

import { Button } from '@/components/atoms/Button'

export type GeolocationPromptProps = {
  /** The IP-guessed city, interpolated into the prompt's question. */
  city: string
  /** Accept the suggestion. This navigates into the distance-ranked nearby search. */
  onAccept: () => void
  /** Dismiss the suggestion for the rest of the session. */
  onClose: () => void
}

/**
 * The dismissible "Classes near %{city}" suggestion, attached under the search field so it reads
 * as one of the field's own suggestions: the place the visitor might want to search. Its text is a
 * button into the distance-ranked search; the × dismisses it for the session. It announces
 * politely (`role="status"`), since it is a passive guess, and it is framed as a guess, never
 * "your location". It carries no second link: a country-website line under it was too small to
 * tap on a phone, and Anton didn't want it. This is presentational only. The IP lookup,
 * session-scoped dismissal and navigation live in `GeolocationSuggestion` (src/views/shared.tsx).
 */
export function GeolocationPrompt({ city, onAccept, onClose }: GeolocationPromptProps) {
  const { t } = useTranslation()

  // It matches the field above it: the same width and 8px corners, the field's type size
  // (`field-size`), the pin in the column of the field's search glyph (9px in) and the words on
  // the field's text edge (41px in). Today's light-blue tint, which Anton preferred to sand (6 Nov).
  // Never the coral tint: a pink band read like an error.
  return (
    <div
      className="mt-1.5 flex items-center rounded-lg bg-secondary-3 text-secondary-11"
      role="status"
    >
      <button
        className="touch-target relative flex min-w-0 flex-1 items-center gap-3 py-2 ps-[9px] text-start field-size font-medium hover:underline focus:outline-none focus-visible:underline"
        type="button"
        onClick={onAccept}
      >
        <MapPin aria-hidden className="shrink-0" size={20} />
        <span className="truncate">{t('countries.near_city', { city })}</span>
        <ChevronRight aria-hidden className="-ms-1 shrink-0 rtl:-scale-x-100" size={18} />
      </button>
      <Button
        isIconOnly
        aria-label={t('search.nearby_prompt.dismiss')}
        className="me-0.5 shrink-0 opacity-80 hover:opacity-100"
        size="sm"
        variant="ghost"
        onClick={onClose}
      >
        <X size={16} />
      </Button>
    </div>
  )
}
