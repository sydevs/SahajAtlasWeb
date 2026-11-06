import { useTranslation } from 'react-i18next'
import { ChevronRight, MapPin, X } from 'lucide-react'

import { Button } from '@/components/atoms/Button'
import { Spinner } from '@/components/atoms/Spinner'

export type GeolocationPromptProps = {
  /** The IP-guessed city: "Classes near %{city}". Leave it out to give `label` instead. */
  city?: string
  /** The words when there is no guessed city ("Classes near me", "Finding your location…"). */
  label?: string
  /** The row's action: the nearby search for a guess, or asking the browser for a position. */
  onAccept: () => void
  /** Dismiss the suggestion for the rest of the session. Leave it out for no ×. */
  onClose?: () => void
  /** While the browser looks for a position: a spinner in the pin's place, and no taps. */
  busy?: boolean
  /** The words report a problem (a refused or failed fix), so they are announced at once. */
  alert?: boolean
}

/**
 * The location suggestion, attached under the search field so it reads as one of the field's own
 * suggestions: "Classes near Prague" on a country page, and on the world view either that guess or
 * "Classes near me", which asks the browser. One look in every place it appears (Anton, 6 Nov). Its
 * text is a button; the × dismisses a guess for the session. It is framed as a guess, never "your
 * location". It carries no second link: a country-website line under it was too small to tap on a
 * phone, and Anton didn't want it. This is presentational only. The IP lookup, dismissal and
 * navigation live in `GeolocationSuggestion` and `NearMeRow`.
 */
export function GeolocationPrompt({
  city,
  label,
  onAccept,
  onClose,
  busy = false,
  alert = false,
}: GeolocationPromptProps) {
  const { t } = useTranslation()
  const text = city !== undefined ? t('countries.near_city', { city }) : (label ?? '')

  // It matches the field above it: the same width and 8px corners, the field's type size
  // (`field-size`), the pin in the column of the field's search glyph (9px in) and the words on
  // the field's text edge (41px in). Today's light-blue tint, which Anton preferred to sand (6 Nov).
  // Never the coral tint: a pink band read like an error.
  return (
    <div
      className="mt-1.5 flex items-center rounded-lg bg-secondary-3 text-secondary-11"
      role={alert ? 'alert' : 'status'}
    >
      <button
        className="touch-target relative flex min-h-10 min-w-0 flex-1 items-center gap-3 py-2 ps-[9px] pe-3 text-start field-size font-medium hover:underline focus:outline-none focus-visible:underline disabled:no-underline"
        disabled={busy}
        type="button"
        onClick={onAccept}
      >
        <span className="flex w-5 shrink-0 justify-center">
          {busy ? <Spinner size="sm" /> : <MapPin aria-hidden size={20} />}
        </span>
        <span className="truncate">{text}</span>
        {!busy && (
          <ChevronRight aria-hidden className="-ms-1 shrink-0 rtl:-scale-x-100" size={18} />
        )}
      </button>
      {onClose && (
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
      )}
    </div>
  )
}
