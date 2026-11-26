import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { type StepProps, TITLE_MAX } from './fields'

import { Input } from '@/components/atoms/Input'
import { FormField } from '@/components/molecules/FormField'
import { USER_SUBMISSION_VALUE_MAX } from '@/config/api/mutate'
import { useLocale } from '@/hooks/use-locale'
import { useLanguageOptions } from '@/hooks/use-language-options'
import { MultiSelect } from '@/components/molecules/MultiSelect'

export function MoreStep({
  draft,
  errors = {},
  languageOptions,
  onChange,
}: StepProps & { languageOptions: string[] }) {
  const { t } = useTranslation()
  const { languageLabel } = useLocale()
  const codes = useMemo(
    () => [...new Set([...draft.languages, ...languageOptions])],
    [draft.languages, languageOptions],
  )
  const options = useLanguageOptions(codes)

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-base font-semibold">{t('submit.more.title')}</h3>
      <FormField
        help={t('submit.more.title_help')}
        htmlFor="submit-title"
        label={t('submit.more.title_label')}
      >
        {(control) => (
          <Input
            {...control}
            maxLength={TITLE_MAX}
            value={draft.title}
            onChange={(event) => onChange({ title: event.target.value })}
          />
        )}
      </FormField>
      <FormField label={t('submit.more.languages_label')}>
        <MultiSelect
          label={t('submit.more.languages_label')}
          options={options}
          triggerLabel={draft.languages.map(languageLabel).join(', ')}
          value={draft.languages}
          onChange={(languages) => onChange({ languages })}
        />
      </FormField>
      <FormField
        error={errors.website && t('submit.errors.online_url')}
        htmlFor="submit-website"
        label={t('submit.more.website_label')}
      >
        {(control) => (
          <Input
            {...control}
            maxLength={USER_SUBMISSION_VALUE_MAX}
            type="url"
            value={draft.website}
            onChange={(event) => onChange({ website: event.target.value })}
          />
        )}
      </FormField>
    </div>
  )
}
