import { useSuspenseQuery } from '@tanstack/react-query'
import { Helmet } from 'react-helmet-async'
import { CircleFlag } from 'react-circle-flags'
import { useTranslation } from 'react-i18next'

import { DrawerBody, DrawerHeader } from '@/components/atoms/Drawer'
import { List, RegionCard } from '@/components/molecules'
import api, { clientQuery } from '@/config/api'
import atlasAuth from '@/config/api/auth'
import { useLocale } from '@/hooks/use-locale'
import { useMapController } from '@/hooks/use-map-controller'
import { useWidgetMode } from '@/config/mode'
import { validateWebUrl } from '@/lib/url'
import { CollapseToggle, SearchField, useFrameOnTop } from '@/views/shared'

// The base view (route `/`): the global country list, with the geocoder + a
// stacked-list toggle in its header. Rendered as inner content of the persistent
// drawer (DrawerStack owns the sheet). Handled like every other view — it's simply
// the one with no parent, so dismissing it collapses the sheet to its peek.
export function CountriesView() {
  const { t } = useTranslation('common')
  const { regionNames } = useLocale()
  const { standalone } = useWidgetMode()
  const { frameSearch } = useMapController()

  const { data: countries } = useSuspenseQuery({
    queryKey: ['countries'],
    queryFn: () => api.getCountries(),
  })
  const { data: client } = useSuspenseQuery(clientQuery(atlasAuth.apiKey))

  // Frame the world view when this view mounts.
  useFrameOnTop(() => frameSearch({}), [frameSearch])

  const homeUrl = client.region && typeof client.region === 'object' ? client.region.webUrl : null
  const canonicalUrl = validateWebUrl(homeUrl)

  return (
    <>
      {standalone && (
        <Helmet>
          <title>{t('free_meditation_classes')}</title>
          {canonicalUrl && <link href={canonicalUrl} rel="canonical" />}
          {canonicalUrl && <meta content={canonicalUrl} property="og:url" />}
        </Helmet>
      )}
      <DrawerHeader>
        <SearchField />
        <CollapseToggle />
      </DrawerHeader>
      <DrawerBody>
        <List>
          {countries.map((country) => (
            <RegionCard
              key={country.id}
              count={country.eventCount}
              href={country.path}
              label={(country.countryCode && regionNames.of(country.countryCode)) || country.name}
            >
              {country.countryCode && (
                <CircleFlag
                  className="mr-3 h-7 w-7 rounded-full border border-divider bg-divider lg:h-9 lg:w-9"
                  countryCode={country.countryCode.toLocaleLowerCase()}
                />
              )}
            </RegionCard>
          ))}
        </List>
      </DrawerBody>
    </>
  )
}
