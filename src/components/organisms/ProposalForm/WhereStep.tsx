import type { ListingDraft } from '@/lib/proposal'
import type { GeocodingFeature } from '@mapbox/search-js-core'

import { useTranslation } from 'react-i18next'

import { type StepProps, CONTACT_MAX, ValidatedInput } from './fields'

import { ToggleGroup, ToggleGroupItem } from '@/components/atoms/ToggleGroup'
import { FormField } from '@/components/molecules/FormField'
import { MapSearch } from '@/components/organisms/Mapbox/MapSearch'

export function WhereStep({
  draft,
  errors = {},
  proximity,
  onChange,
  onPick,
}: StepProps & {
  proximity?: { lng: number; lat: number }
  onPick: (key: 'address' | 'city') => (feature: GeocodingFeature) => void
}) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-md font-semibold">{t('submit.where.title')}</h3>
      <ToggleGroup
        joined
        aria-label={t('submit.where.title')}
        type="single"
        value={draft.eventType}
        onValueChange={(value) =>
          value && onChange({ eventType: value as ListingDraft['eventType'] })
        }
      >
        <ToggleGroupItem value="offline">{t('submit.where.offline')}</ToggleGroupItem>
        <ToggleGroupItem value="online">{t('submit.where.online')}</ToggleGroupItem>
      </ToggleGroup>

      {draft.eventType === 'offline' ? (
        <>
          <FormField
            required
            error={errors.address && t('submit.errors.address_required')}
            label={t('submit.where.address_label')}
          >
            <MapSearch
              label={t('submit.where.address_placeholder')}
              proximity={proximity}
              query={{ initial: draft.address?.label ?? '' }}
              types="address"
              onSelect={onPick('address')}
            />
          </FormField>
          <ValidatedInput
            id="submit-room"
            label={t('submit.where.room_label')}
            maxLength={CONTACT_MAX}
            value={draft.room}
            onChange={(event) => onChange({ room: event.target.value })}
          />
        </>
      ) : (
        <>
          <ValidatedInput
            required
            error={errors.onlineUrl && t('submit.errors.online_url')}
            id="submit-online-url"
            label={t('submit.where.online_url_label')}
            placeholder={t('submit.where.online_url_placeholder')}
            type="url"
            value={draft.onlineUrl}
            onChange={(event) => onChange({ onlineUrl: event.target.value })}
          />
          <FormField
            required
            error={errors.city && t('submit.errors.city_required')}
            help={t('submit.where.city_help')}
            label={t('submit.where.city_label')}
          >
            <MapSearch
              label={t('submit.where.city_placeholder')}
              proximity={proximity}
              query={{ initial: draft.city?.label ?? '' }}
              types="place"
              onSelect={onPick('city')}
            />
          </FormField>
        </>
      )}
    </div>
  )
}
