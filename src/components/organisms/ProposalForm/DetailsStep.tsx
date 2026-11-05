import type { ListingDraft, ListingErrors } from '@/lib/proposal'

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ClipboardList, ExternalLink } from 'lucide-react'

import {
  ChoiceCard,
  FIELD_TEXT,
  GroupHeading,
  NameHelp,
  StepHeading,
  ValidatedInput,
  radioKeys,
} from './fields'
import { useAutoTitle } from './summary'

import { Textarea } from '@/components/atoms/Textarea'
import { FormField } from '@/components/molecules/FormField'
import { MultiSelect } from '@/components/molecules/MultiSelect'
import { USER_SUBMISSION_VALUE_MAX, userSubmissionValueMax } from '@/config/api/mutate'
import { useLanguageOptions } from '@/hooks/use-language-options'
import { useLocale } from '@/hooks/use-locale'

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
 * Step 3: the class's name, since it heads the listing, then the language and everything else
 * that helps someone decide to come, all optional. Grouped by what a newcomer asks: what
 * language, who do I ask, what is it like.
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
  const autoTitle = useAutoTitle(draft)
  const signupLink = !keepTitle && draft.signup === 'elsewhere'

  return (
    <div className="flex flex-col gap-6">
      <StepHeading intro={t('submit.details.intro_language')} title={t('submit.details.title')} />

      <ValidatedInput
        help={
          <NameHelp
            guidance={
              keepTitle
                ? t('submit.details.title_keep')
                : [
                    t('submit.details.title_guidance'),
                    autoTitle && t('submit.details.title_blank', { name: autoTitle }),
                  ]
                    .filter(Boolean)
                    .join(' ')
            }
            value={draft.title}
          />
        }
        id="submit-title"
        label={t('submit.more.title_label')}
        maxLength={TITLE_MAX}
        // A correction shows the name it keeps. A new class shows none: a grey name in the field
        // reads as already filled in.
        placeholder={keepTitle}
        value={draft.title}
        onChange={(event) => onChange({ title: event.target.value })}
      />

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

      {!keepTitle && (
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-sm font-semibold">{t('submit.signup.title')}</legend>
          <div className="flex flex-col gap-2" role="radiogroup" {...radioKeys}>
            <ChoiceCard
              hint={t('submit.signup.here_hint')}
              icon={ClipboardList}
              label={t('submit.signup.here')}
              selected={draft.signup === 'here'}
              tabStop={draft.signup === 'here'}
              onSelect={() => onChange({ signup: 'here' })}
            />
            <ChoiceCard
              hint={t('submit.signup.elsewhere_hint')}
              icon={ExternalLink}
              label={t('submit.signup.elsewhere')}
              selected={draft.signup === 'elsewhere'}
              tabStop={draft.signup === 'elsewhere'}
              onSelect={() => onChange({ signup: 'elsewhere' })}
            />
          </div>
        </fieldset>
      )}

      <ValidatedInput
        error={errors.website && t('submit.errors.online_url')}
        help={signupLink ? t('submit.signup.link_help') : undefined}
        id="submit-website"
        inputMode="url"
        label={t(signupLink ? 'submit.signup.link_label' : 'submit.more.website_label')}
        maxLength={USER_SUBMISSION_VALUE_MAX}
        placeholder="https://"
        required={signupLink}
        type="url"
        value={draft.website}
        onChange={(event) => onChange({ website: event.target.value })}
      />
    </div>
  )
}
