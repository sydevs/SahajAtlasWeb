import type { ListingDraft, ListingErrors, PickedPlace } from '@/lib/proposal'
import type { GeocodingFeature } from '@mapbox/search-js-core'
import type { ReactNode } from 'react'

import { useTranslation } from 'react-i18next'
import { MapPin, Monitor } from 'lucide-react'

import { ChoiceCard, StepHeading, ValidatedInput } from './fields'

import { Button } from '@/components/atoms/Button'
import { FormField } from '@/components/molecules/FormField'
import { MapSearch } from '@/components/organisms/Mapbox/MapSearch'
import { staticMapUrl } from '@/lib/static-map'

/** The contact fields' bound on an Event — the room shares it. */
const ROOM_MAX = 100

type PlaceKey = 'address' | 'city'

export type PlaceStepProps = {
  draft: ListingDraft
  errors: ListingErrors
  proximity?: { lng: number; lat: number }
  country?: string
  onChange: (patch: Partial<ListingDraft>) => void
  onPick: (key: PlaceKey) => (feature: GeocodingFeature) => void
  onEdit: (key: PlaceKey) => () => void
  /** "Is it one of these?" — shown once an address lands on a class already listed. */
  notice?: ReactNode
  /** A small map under the picked address, where the live one can't be seen. */
  showMap?: boolean
}

/** Step 1: in person or online, and where. */
export function PlaceStep({
  draft,
  errors,
  proximity,
  country,
  onChange,
  onPick,
  onEdit,
  notice,
  showMap = true,
}: PlaceStepProps) {
  const { t } = useTranslation()
  const offline = draft.eventType === 'offline'

  return (
    <div className="flex flex-col gap-5">
      <StepHeading title={t('submit.where.title')} />

      <div
        aria-label={t('submit.where.title')}
        className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2"
        role="radiogroup"
      >
        <ChoiceCard
          hint={t('submit.where.offline_hint')}
          icon={MapPin}
          label={t('submit.where.offline')}
          selected={offline}
          onSelect={() => onChange({ eventType: 'offline' })}
        />
        <ChoiceCard
          hint={t('submit.where.online_hint')}
          icon={Monitor}
          label={t('submit.where.online')}
          selected={!offline}
          onSelect={() => onChange({ eventType: 'online' })}
        />
      </div>

      {offline ? (
        <>
          <PlaceField
            error={errors.address && t('submit.errors.address_required')}
            help={t('submit.where.address_help')}
            label={t('submit.where.venue_label')}
            place={draft.address}
            search={
              <MapSearch
                country={country}
                label={t('submit.where.address_placeholder')}
                proximity={proximity}
                query={{ initial: '' }}
                types="address"
                onQueryChange={onEdit('address')}
                onSelect={onPick('address')}
              />
            }
            showMap={showMap}
            onClear={() => onChange({ address: null })}
          />
          {notice}
          <ValidatedInput
            id="submit-room"
            label={t('submit.where.room_label')}
            maxLength={ROOM_MAX}
            placeholder={t('submit.where.room_placeholder')}
            value={draft.room}
            onChange={(event) => onChange({ room: event.target.value })}
          />
        </>
      ) : (
        <>
          <ValidatedInput
            required
            autoComplete="url"
            error={errors.onlineUrl && t('submit.errors.online_url')}
            help={t('submit.where.online_url_help')}
            id="submit-online-url"
            inputMode="url"
            label={t('submit.where.online_url_label')}
            placeholder={t('submit.where.online_url_placeholder')}
            type="url"
            value={draft.onlineUrl}
            onChange={(event) => onChange({ onlineUrl: event.target.value })}
          />
          <PlaceField
            error={errors.city && t('submit.errors.city_required')}
            help={t('submit.where.city_help')}
            label={t('submit.where.city_label')}
            place={draft.city}
            search={
              <MapSearch
                country={country}
                label={t('submit.where.city_placeholder')}
                proximity={proximity}
                query={{ initial: '' }}
                types="place"
                onQueryChange={onEdit('city')}
                onSelect={onPick('city')}
              />
            }
            onClear={() => onChange({ city: null })}
          />
        </>
      )}
    </div>
  )
}

/**
 * A place search that, once answered, turns into the answer: the place in two lines, a small
 * map of it, and a way to change it. Searching again is one tap away, never an edit of a long
 * label squeezed into a field.
 */
function PlaceField({
  label,
  help,
  error,
  place,
  search,
  showMap = false,
  onClear,
}: {
  label: string
  help: string
  error?: string | false
  place: PickedPlace | null
  search: ReactNode
  showMap?: boolean
  onClear: () => void
}) {
  const { t } = useTranslation()

  if (!place) {
    return (
      <FormField required error={error} help={help} label={label}>
        {/* The geocoder's own input carries no `aria-invalid`, so this marks the field for the
            focus-the-first-error pass instead. */}
        <div
          className={error ? 'rounded ring-2 ring-danger-9' : undefined}
          data-invalid={error ? true : undefined}
        >
          {search}
        </div>
      </FormField>
    )
  }

  const [first, ...rest] = place.label.split(', ')
  const map =
    showMap && place.latitude !== undefined && place.longitude !== undefined
      ? staticMapUrl({
          longitude: place.longitude,
          latitude: place.latitude,
          width: 480,
          height: 144,
        })
      : null

  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-medium">{label}</span>
      <div className="overflow-hidden rounded-lg border border-gray-6">
        {map && (
          <img
            alt={t('submit.where.map_alt', { place: place.label })}
            className="block h-28 w-full bg-gray-3 object-cover"
            height={144}
            loading="lazy"
            src={map}
            width={480}
          />
        )}
        <div className="flex items-start gap-3 px-3 py-2.5">
          <MapPin aria-hidden className="mt-0.5 shrink-0 text-primary" size={18} />
          <div className="min-w-0 flex-1">
            <p className="text-sm leading-snug font-medium">{first}</p>
            {rest.length > 0 && (
              <p className="text-sm leading-snug text-gray-11">{rest.join(', ')}</p>
            )}
          </div>
          <Button
            className="-my-1 -me-2 shrink-0"
            color="primary"
            size="sm"
            variant="ghost"
            onClick={onClear}
          >
            {t('submit.chrome.change')}
          </Button>
        </div>
      </div>
    </div>
  )
}
