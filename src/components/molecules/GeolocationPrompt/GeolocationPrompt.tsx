import { useTranslation } from 'react-i18next'
import { ChevronRight, MapPin } from 'lucide-react'

import { Alert } from '@/components/atoms/Alert'
import { Link } from '@/components/atoms/Link'

export type GeolocationPromptProps = {
  /** The IP-guessed city, interpolated into the prompt's question. */
  city: string
  /** Accept the suggestion. This navigates into the distance-ranked nearby search. */
  onAccept: () => void
  /** Dismiss the suggestion for the rest of the session. */
  onClose: () => void
  /** The guessed country's own website, offered as a second way to go local. */
  site?: { href: string; country: string }
}

/**
 * The dismissible "events near you" suggestion shown above the list on the
 * top-level views: a single-line, sand (neutral) `Alert` whose text is a
 * button into the distance-ranked search. The Alert's × dismisses it for
 * the session. It announces politely (`role="status"`), not as an
 * assertive alert, since it is a passive guess. It is framed as a *guess*:
 * "Classes near %{city}", never "your location". This is
 * presentational only. The IP lookup, session-scoped dismissal, and
 * navigation live in `GeolocationSuggestion` (src/views/shared.tsx).
 */
export function GeolocationPrompt({ city, onAccept, onClose, site }: GeolocationPromptProps) {
  const { t } = useTranslation()

  // Inset by the panel's 16px gutter so the banner lines up with the header
  // above and the rows below, and reads as a note rather than a page band.
  // The gap puts its text at 56px, on the label edge of the rows with a glyph.
  // The end padding keeps the close button's hover square inside the banner.
  // The sand neutral, in light and dark. Not the coral tint: a pink band at the top of
  // the list read like an error, and coral is kept for the chosen pin, the today tag and
  // the meditating figure. Not the light-blue secondary either: it read cold, and that
  // hue is kept for the language tag. Sand-12 text clears 13:1 in both modes, and the
  // sand-11 website link 5.3:1 (light) and 7.6:1 (dark).
  return (
    <Alert
      className="mx-4 mb-2 gap-2.5 rounded-lg ps-3 pe-1"
      closeLabel={t('search.nearby_prompt.dismiss')}
      color="neutral"
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
    >
      {site && (
        // Quiet on purpose. The row above is what the notice is for; this one leaves the page.
        // A child, not the `description`: that slot is dimmed to 90%, which would take the
        // sand-11 link under 4.5:1 on the sand fill.
        <div className="text-sm">
          <Link isExternal className="text-gray-11 hover:underline" href={site.href}>
            {t('search.country_site.cta', { country: site.country })}
          </Link>
        </div>
      )}
    </Alert>
  )
}
