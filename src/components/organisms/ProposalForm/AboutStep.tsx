import { useTranslation } from 'react-i18next'

import { type StepProps } from './fields'

import { Textarea } from '@/components/atoms/Textarea'
import { FormField } from '@/components/molecules/FormField'
import { userSubmissionValueMax } from '@/config/api/mutate'

export function AboutStep({ draft, onChange }: StepProps) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-md font-semibold">{t('submit.about.title')}</h3>
      <FormField htmlFor="submit-description" label={t('submit.about.description_label')}>
        <Textarea
          id="submit-description"
          maxLength={userSubmissionValueMax('message')}
          placeholder={t('submit.about.description_placeholder')}
          rows={5}
          value={draft.description}
          onChange={(event) => onChange({ description: event.target.value })}
        />
      </FormField>
    </div>
  )
}
