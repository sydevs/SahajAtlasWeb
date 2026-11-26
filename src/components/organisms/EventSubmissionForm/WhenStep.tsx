import type { ListingDraft } from '@/lib/event-submission'

import { useTranslation } from 'react-i18next'

import { type StepProps } from './fields'

import { Input } from '@/components/atoms/Input'
import { ToggleGroup, ToggleGroupItem } from '@/components/atoms/ToggleGroup'
import { FormField } from '@/components/molecules/FormField'

export function WhenStep({ draft, errors = {}, onChange }: StepProps) {
  const { t } = useTranslation()
  const repeating = draft.repeats !== 'once'

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-base font-semibold">{t('submit.when.title')}</h3>
      <FormField
        required
        error={errors.firstDate && t('submit.errors.first_date')}
        htmlFor="submit-first-date"
        label={t('submit.when.first_date')}
      >
        {(control) => (
          <Input
            {...control}
            type="date"
            value={draft.firstDate}
            onChange={(event) => onChange({ firstDate: event.target.value })}
          />
        )}
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField
          required
          error={errors.startTime && t('submit.errors.start_time')}
          htmlFor="submit-start-time"
          label={t('submit.when.start_time')}
        >
          {(control) => (
            <Input
              {...control}
              type="time"
              value={draft.startTime}
              onChange={(event) => onChange({ startTime: event.target.value })}
            />
          )}
        </FormField>
        <FormField htmlFor="submit-end-time" label={t('submit.when.end_time')}>
          {(control) => (
            <Input
              {...control}
              type="time"
              value={draft.endTime}
              onChange={(event) => onChange({ endTime: event.target.value })}
            />
          )}
        </FormField>
      </div>
      <p className="-mt-2 text-xs text-gray-11">
        {t('submit.when.timezone_note', { timezone: draft.timeZone })}
      </p>
      <FormField as="fieldset" label={t('submit.when.repeats')} name="submit-repeats">
        {(control) => (
          <ToggleGroup
            {...control}
            joined
            required
            size="md"
            type="single"
            value={draft.repeats}
            onValueChange={(value) => onChange({ repeats: value as ListingDraft['repeats'] })}
          >
            <ToggleGroupItem value="once">{t('filters.cadence.once')}</ToggleGroupItem>
            <ToggleGroupItem value="weekly">{t('filters.cadence.weekly')}</ToggleGroupItem>
            <ToggleGroupItem value="monthly">{t('filters.cadence.monthly')}</ToggleGroupItem>
          </ToggleGroup>
        )}
      </FormField>
      {repeating && (
        <FormField htmlFor="submit-end-date" label={t('submit.when.end_date')}>
          {(control) => (
            <Input
              {...control}
              min={draft.firstDate || undefined}
              type="date"
              value={draft.endDate}
              onChange={(event) => onChange({ endDate: event.target.value })}
            />
          )}
        </FormField>
      )}
    </div>
  )
}
