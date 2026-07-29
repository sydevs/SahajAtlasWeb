import { CircleFlag } from 'react-circle-flags'
import { useTranslation } from 'react-i18next'

import { Alert } from '@/components/atoms/Alert'
import { Link } from '@/components/atoms/Link'
import { useLocale } from '@/hooks/use-locale'

export type CountrySiteOfferProps = {
  /** Uppercase ISO alpha-2 code of the searched country (drives the flag + name). */
  countryCode: string
  /** The country's own Sahaja Yoga site, from `COUNTRY_SITES`. */
  href: string
}

/**
 * The next step offered when a search lands in a country that lists no programs at
 * all: its national Sahaja Yoga site, which does carry local contact details
 * (issue #82). Built from the same `Alert` the neighbouring empty states use, so it
 * reads as one of them rather than new chrome — flagged and named in the viewer's
 * language, with the link opening in a new tab (the `Link` atom's `isExternal`
 * already carries `rel="noopener noreferrer"`).
 *
 * Purely presentational: whether the country is genuinely program-less
 * (`countryHasPrograms`) and whether it has a site are decided by `EmptyResults`
 * (organisms/EventsList/DynamicEventsList).
 */
export function CountrySiteOffer({ countryCode, href }: CountrySiteOfferProps) {
  const { t } = useTranslation('common')
  const { regionNames } = useLocale()
  // `countryCode` is always canonical uppercase alpha-2 (`isoCountryCode`), so `of`
  // resolves or returns the code — it can't throw here.
  const country = regionNames.of(countryCode) ?? countryCode

  return (
    <Alert
      align="start"
      color="neutral"
      icon={
        <CircleFlag
          className="h-5 w-5 rounded-full border border-divider bg-divider"
          countryCode={countryCode.toLowerCase()}
        />
      }
      title={t('country_site.title', { country })}
    >
      <Link
        isExternal
        showAnchorIcon
        className="mt-2 text-sm font-medium"
        color="primary"
        href={href}
      >
        {t('country_site.cta', { country })}
      </Link>
    </Alert>
  )
}
