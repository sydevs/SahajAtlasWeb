import type { RecoveryOffer } from '@/hooks/use-recovery-offer'

import { useTranslation } from 'react-i18next'

import { Alert } from '@/components/atoms/Alert'
import { Link } from '@/components/atoms/Link'

export type NotFoundOfferProps = {
  /** The sentence naming what was missing — "that event" / "that place". */
  message: string
  /** Where to send the viewer; resolved by `useRecoveryOffer`. */
  offer: RecoveryOffer
  /** The prompted geocoder field. Rendered as a child so this stays presentational and
   *  the map-dependent import stays out of it. */
  children?: React.ReactNode
}

/**
 * What a dead link shows instead of an error (issue #89): the sentence, one place to go,
 * and a field to name somewhere else.
 *
 * Deliberately in the **empty-state** register, not the error one — `Alert color="neutral"`
 * and `role="status"`, matching `CountrySiteOffer` and `EmptyResults`. A dead link is a
 * wrong turn, not a malfunction: red chrome and an assertive announcement would overstate
 * a situation the viewer can simply walk out of. If this ever renders red, the two
 * registers have drifted.
 *
 * No flag icon, unlike `CountrySiteOffer`: that CDN image would render as a broken box
 * beside the sentence apologising for the breakage — and a blocked CSP is a plausible
 * cause of the failure in the first place.
 *
 * Purely presentational. Which rung the offer came from is `useRecoveryOffer`'s decision.
 */
export function NotFoundOffer({ message, offer, children }: NotFoundOfferProps) {
  const { t } = useTranslation('common', { useSuspense: false })

  // Every label carries an English `defaultValue`: namespaces load over HTTP, and a
  // network failure is exactly when they don't arrive — so without it the one screen that
  // exists to explain a failure would render raw i18n keys.
  const label =
    offer.kind === 'countries'
      ? t('error.browse_countries', { defaultValue: 'Browse all countries' })
      : offer.kind === 'city'
        ? t('error.near_city', { city: offer.name, defaultValue: 'See events near %{city}' })
        : t('error.back_to_region', {
            region: offer.name,
            defaultValue: 'See events in %{region}',
          })

  return (
    <Alert align="start" color="neutral" description={message} role="status">
      <Link className="mt-2 text-sm font-medium" color="primary" href={offer.path}>
        {label}
      </Link>
      {children && (
        <div className="mt-4 flex flex-col gap-1.5">
          {/* The field is unlabelled without this: dropped out of a header, its only name
              is the "search for events near…" placeholder, which on this screen reads as
              a promise that there ARE nearby events. */}
          <p className="text-sm text-gray-11">
            {t('error.search_prompt', { defaultValue: 'Or search for a place:' })}
          </p>
          {children}
        </div>
      )}
    </Alert>
  )
}
