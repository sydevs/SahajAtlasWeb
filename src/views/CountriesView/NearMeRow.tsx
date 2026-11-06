import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { GeolocationPrompt } from '@/components/molecules/GeolocationPrompt'
import { useGeolocateToSearch } from '@/hooks/use-geolocate'
import { useMapController } from '@/hooks/use-map-controller'
import { deepActiveElement } from '@/lib/active-element'
import { SearchField, useIpSuggestion } from '@/views/shared'

/**
 * The first thing a visitor sees: one obvious way to a class near them, then the town search.
 *
 * The location line is there from the first paint, so the IP guess, which can land seconds later,
 * changes its words in place and never moves the list. With a guess it offers that city, and its ×
 * dismisses a wrong guess, which turns the line into "Classes near me". Without a guess, the line
 * itself asks for the location.
 *
 * "Classes near me" takes the same route as the map's locate control: a navigation into the
 * distance-ranked search, so it works with or without a map. A refused or failed fix says so and
 * hands the visitor to the search.
 */
export function NearMeRow() {
  const { t } = useTranslation()
  const { hasMap } = useMapController()
  const suggestion = useIpSuggestion()
  // This view unmounts as it navigates, so the place is named before the search opens. A map-less
  // embed promises no Mapbox calls, so there it opens on the coordinates alone.
  const toSearch = useGeolocateToSearch({ naming: hasMap ? 'first' : 'none' })
  const [state, setState] = useState<'idle' | 'locating' | 'failed'>('idle')
  const search = useRef<HTMLDivElement>(null)
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
    // Hand focus to the search only if the visitor hasn't moved it: still on the line that asked,
    // or nowhere (the line drops focus while it is busy and disabled).
    const focused = deepActiveElement()

    if (!focused || focused === document.body || search.current?.contains(focused)) {
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
    // The search field leads: typing a town is the most direct way to classes. The location line
    // under it is the same one a country page shows, so it looks the same everywhere (Anton, 6 Nov).
    // It is always there, so a guess or a failure that lands late changes its words and moves
    // nothing.
    <div ref={search} className="px-4 pb-2">
      <SearchField />
      {offer ? (
        <GeolocationPrompt
          city={offer.guess.city}
          onAccept={offer.accept}
          onClose={offer.dismiss}
        />
      ) : (
        <GeolocationPrompt
          alert={state === 'failed'}
          busy={locating}
          label={
            locating
              ? t('countries.locating')
              : state === 'failed'
                ? t('common.map.location_failed')
                : t('countries.near_me')
          }
          onAccept={locate}
        />
      )}
    </div>
  )
}
