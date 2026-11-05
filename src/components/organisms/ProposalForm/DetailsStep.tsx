import type { ListingDraft, ListingErrors } from '@/lib/proposal'

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { FIELD_TEXT, GroupHeading, StepHeading, ValidatedInput } from './fields'

import { Textarea } from '@/components/atoms/Textarea'
import { FormField } from '@/components/molecules/FormField'
import { MultiSelect } from '@/components/molecules/MultiSelect'
import { USER_SUBMISSION_VALUE_MAX, userSubmissionValueMax } from '@/config/api/mutate'
import { useLanguageOptions } from '@/hooks/use-language-options'
import { useLocale } from '@/hooks/use-locale'
import { draftTitle } from '@/lib/proposal'

/** The Events title's own bound. */
const TITLE_MAX = 100
/** The contact fields' bound on an Event. */
const CONTACT_MAX = 100

export type DetailsStepProps = {
  draft: ListingDraft
  errors: ListingErrors
  /** The languages offered, beyond the ones already chosen. */
  languageOptions: string[]
  /** A correction keeps the published name when the field is left blank. */
  keepTitle?: string
  onChange: (patch: Partial<ListingDraft>) => void
}

/**
 * Step 3: everything that helps someone decide to come, none of it required. Grouped by what a
 * newcomer asks — what language, who do I ask, what is it like — and the class's name last,
 * since it has a sensible default.
 */
export function DetailsStep({
  draft,
  errors,
  languageOptions,
  keepTitle,
  onChange,
}: DetailsStepProps) {
  const { t } = useTranslation()
  const { languageLabel } = useLocale()
  const codes = useMemo(
    () => [...new Set([...draft.languages, ...languageOptions])],
    [draft.languages, languageOptions],
  )
  const options = useLanguageOptions(codes)
  const defaultTitle = keepTitle ?? draftTitle({ ...draft, title: '' })

  return (
    <div className="flex flex-col gap-6">
      <StepHeading intro={t('submit.details.intro')} title={t('submit.details.title')} />

      <FormField
        required
        error={errors.languages && t('submit.errors.languages')}
        help={t('submit.details.languages_help')}
        label={t('submit.more.languages_label')}
      >
        <MultiSelect
          label={t('submit.more.languages_label')}
          options={options}
          triggerLabel={draft.languages.map(languageLabel).join(', ')}
          value={draft.languages}
          onChange={(languages) => onChange({ languages })}
        />
      </FormField>

      <section className="flex flex-col gap-3">
        <GroupHeading help={t('submit.details.contact_help')} title={t('submit.contact.title')} />
        <ValidatedInput
          autoComplete="off"
          id="submit-contact-name"
          label={t('submit.contact.name_label')}
          maxLength={CONTACT_MAX}
          value={draft.contactName}
          onChange={(event) => onChange({ contactName: event.target.value })}
        />
        <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
          <ValidatedInput
            autoComplete="off"
            id="submit-contact-phone"
            inputMode="tel"
            label={t('submit.contact.phone_label')}
            maxLength={CONTACT_MAX}
            type="tel"
            value={draft.contactPhone}
            onChange={(event) => onChange({ contactPhone: event.target.value })}
          />
          <ValidatedInput
            autoComplete="off"
            error={errors.contactEmail && t('submit.errors.email')}
            id="submit-contact-email"
            inputMode="email"
            label={t('submit.contact.email_label')}
            maxLength={CONTACT_MAX}
            type="email"
            value={draft.contactEmail}
            onChange={(event) => onChange({ contactEmail: event.target.value })}
          />
        </div>
      </section>

      <FormField htmlFor="submit-description" label={t('submit.about.title')}>
        <Textarea
          className={FIELD_TEXT}
          id="submit-description"
          maxLength={userSubmissionValueMax('message')}
          placeholder={t('submit.about.description_placeholder')}
          rows={4}
          value={draft.description}
          onChange={(event) => onChange({ description: event.target.value })}
        />
      </FormField>

      <ValidatedInput
        help={
          keepTitle
            ? t('submit.details.title_keep')
            : defaultTitle
              ? t('submit.details.title_help', { name: defaultTitle })
              : undefined
        }
        id="submit-title"
        label={t('submit.more.title_label')}
        maxLength={TITLE_MAX}
        placeholder={defaultTitle}
        value={draft.title}
        onChange={(event) => onChange({ title: event.target.value })}
      />

      <ValidatedInput
        error={errors.website && t('submit.errors.online_url')}
        id="submit-website"
        inputMode="url"
        label={t('submit.more.website_label')}
        maxLength={USER_SUBMISSION_VALUE_MAX}
        placeholder="https://"
        type="url"
        value={draft.website}
        onChange={(event) => onChange({ website: event.target.value })}
      />
    </div>
  )
}
