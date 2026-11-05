import type { Geojson } from '@/types'

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronRight, LocateFixed, MapPin } from 'lucide-react'

import { Spinner } from '@/components/atoms/Spinner'
import { listRow } from '@/components/molecules/List/List'
import { useGeolocateToSearch } from '@/hooks/use-geolocate'
import { useMapController } from '@/hooks/use-map-controller'
import { deepActiveElement } from '@/lib/active-element'
import { SearchField, useIpSuggestion } from '@/views/shared'

/**
 * The first thing a visitor sees: one obvious way to a class near them, then the town search.
 *
 * The row is there from the first paint, so the IP guess, which can land seconds later, changes its
 * words in place and never moves the list. With a guess the row offers that city, with "Use my
 * location" under it for a guess that is wrong. Without one, the row itself asks for the location.
 *
 * "Classes near me" takes the same route as the map's locate control: a navigation into the
 * distance-ranked search, so it works with or without a map. A refused or failed fix says so and
 * hands the visitor to the search.
 */
export function NearMeRow({ geojson }: { geojson: Geojson | undefined }) {
  const { t } = useTranslation()
  const { hasMap } = useMapController()
  const suggestion = useIpSuggestion()
  // This view unmounts as it navigates, so the place is named before the search opens. A map-less
  // embed promises no Mapbox calls, so there it opens on the coordinates alone.
  const toSearch = useGeolocateToSearch(geojson, { naming: hasMap ? 'first' : 'none' })
  const [state, setState] = useState<'idle' | 'locating' | 'failed'>('idle')
  const search = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  // The fix can arrive seconds later. By then the visitor may have searched a town or opened a
  // class, so an answer belongs only to the request still waiting on this screen.
  const request = useRef(0)

  useEffect(
    () => () => {
      request.current += 1
    },
    [],
  )

  const failed = (id: number) => {
    if (id !== request.current) return
    setState('failed')
    // Hand focus to the search only if the visitor hasn't moved it: still on the button that
    // asked, or nowhere (the button drops focus while it is busy and disabled).
    const focused = deepActiveElement()

    if (!focused || focused === document.body || focused === button.current) {
      search.current?.querySelector('input')?.focus()
    }
  }

  const locate = () => {
    const id = ++request.current

    if (!navigator.geolocation) return failed(id)
    setState('locating')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (id !== request.current) return
        // Stays busy while the place is named; the view unmounts as the search opens.
        void toSearch(position)
      },
      () => failed(id),
      // Long, because this audience can take a while over the browser's permission question, and
      // iOS Safari may count that time. A refusal doesn't wait for this: it answers at once.
      { timeout: 30000, maximumAge: 300000 },
    )
  }

  // A guess that lands while the browser is already asking for a real position must not swap the
  // row out from under that request.
  const offer = state === 'idle' || state === 'failed' ? suggestion : null
  const locating = state === 'locating'

  return (
    <>
      <button
        ref={button}
        className={listRow({
          className: 'flex min-h-14 w-full flex-row items-center py-1.5 text-start font-semibold',
        })}
        disabled={locating}
        type="button"
        onClick={offer ? offer.accept : locate}
      >
        <span className="me-4 flex h-6 w-6 shrink-0 items-center justify-center text-primary-11">
          {locating ? (
            <Spinner size="sm" />
          ) : offer ? (
            <MapPin aria-hidden size={20} />
          ) : (
            <LocateFixed aria-hidden size={20} />
          )}
        </span>
        <span className="min-w-0 flex-grow text-lg">
          {locating
            ? t('countries.locating')
            : offer
              ? t('countries.near_city', { city: offer.guess.city })
              : t('countries.near_me')}
        </span>
        <ChevronRight aria-hidden className="shrink-0 text-gray-9 rtl:-scale-x-100" size={20} />
      </button>
      {/* One quiet line under the row, whatever it says: this slot's height is always there, so a
          guess or a failure that lands late moves nothing. It overlaps the row's empty bottom
          padding, which leaves both tap targets at least 44px tall. */}
      <div className="relative -mt-3 flex min-h-11 items-center ps-14 pe-4 text-sm text-gray-11">
        {state === 'failed' ? (
          <p role="alert">{t('common.map.location_failed')}</p>
        ) : offer ? (
          <button className="min-h-11 w-full text-start" type="button" onClick={locate}>
            {t('countries.not_in_city', { city: offer.guess.city })}{' '}
            <span className="text-primary-11 hover:underline">{t('countries.use_location')}</span>
          </button>
        ) : (
          <p>{t('countries.near_me_hint')}</p>
        )}
      </div>
      <div ref={search} className="px-4 pb-3">
        {/* Not mirrored to `?q`: nothing on this view reads it, and it would count as an active
            place search and swap the row's offer away mid-typing. */}
        <SearchField syncToUrl={false} />
      </div>
    </>
  )
}
