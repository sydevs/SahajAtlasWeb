import type { ListingDraft } from '@/lib/proposal'

import { useTranslation } from 'react-i18next'

import { type StepProps, ValidatedInput } from './fields'

import { ToggleGroup, ToggleGroupItem } from '@/components/atoms/ToggleGroup'
import { FormField } from '@/components/molecules/FormField'

export function WhenStep({ draft, errors = {}, onChange }: StepProps) {
  const { t } = useTranslation()
  const repeating = draft.repeats !== 'once'

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-md font-semibold">{t('submit.when.title')}</h3>
      <ValidatedInput
        required
        error={errors.firstDate && t('submit.errors.first_date')}
        id="submit-first-date"
        label={t('submit.when.first_date')}
        type="date"
        value={draft.firstDate}
        onChange={(event) => onChange({ firstDate: event.target.value })}
      />
      <div className="grid grid-cols-2 gap-3">
        <ValidatedInput
          required
          error={errors.startTime && t('submit.errors.start_time')}
          id="submit-start-time"
          label={t('submit.when.start_time')}
          type="time"
          value={draft.startTime}
          onChange={(event) => onChange({ startTime: event.target.value })}
        />
        <ValidatedInput
          id="submit-end-time"
          label={t('submit.when.end_time')}
          type="time"
          value={draft.endTime}
          onChange={(event) => onChange({ endTime: event.target.value })}
        />
      </div>
      <p className="-mt-2 text-xs text-gray-11">
        {t('submit.when.timezone_note', { timezone: draft.timeZone })}
      </p>
      <FormField label={t('submit.when.repeats')}>
        <ToggleGroup
          joined
          aria-label={t('submit.when.repeats')}
          type="single"
          value={draft.repeats}
          onValueChange={(value) =>
            value && onChange({ repeats: value as ListingDraft['repeats'] })
          }
        >
          <ToggleGroupItem value="once">{t('filters.cadence.once')}</ToggleGroupItem>
          <ToggleGroupItem value="weekly">{t('filters.cadence.weekly')}</ToggleGroupItem>
          <ToggleGroupItem value="monthly">{t('filters.cadence.monthly')}</ToggleGroupItem>
        </ToggleGroup>
      </FormField>
      {repeating && (
        <ValidatedInput
          id="submit-end-date"
          label={t('submit.when.end_date')}
          min={draft.firstDate || undefined}
          type="date"
          value={draft.endDate}
          onChange={(event) => onChange({ endDate: event.target.value })}
        />
      )}
    </div>
  )
}
