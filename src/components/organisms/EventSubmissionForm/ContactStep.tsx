import { useTranslation } from 'react-i18next'

import { type StepProps, CONTACT_MAX } from './fields'

import { Input } from '@/components/atoms/Input'
import { FormField } from '@/components/molecules/FormField'

export function ContactStep({ draft, errors = {}, onChange }: StepProps) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-base font-semibold">{t('submit.contact.title')}</h3>
        <p className="text-sm text-gray-11">{t('submit.contact.help')}</p>
      </div>
      <FormField htmlFor="submit-contact-name" label={t('submit.contact.name_label')}>
        {(control) => (
          <Input
            {...control}
            autoComplete="name"
            maxLength={CONTACT_MAX}
            value={draft.contactName}
            onChange={(event) => onChange({ contactName: event.target.value })}
          />
        )}
      </FormField>
      <FormField htmlFor="submit-contact-phone" label={t('submit.contact.phone_label')}>
        {(control) => (
          <Input
            {...control}
            autoComplete="tel"
            maxLength={CONTACT_MAX}
            type="tel"
            value={draft.contactPhone}
            onChange={(event) => onChange({ contactPhone: event.target.value })}
          />
        )}
      </FormField>
      <FormField
        error={errors.contactEmail && t('submit.errors.email')}
        htmlFor="submit-contact-email"
        label={t('submit.contact.email_label')}
      >
        {(control) => (
          <Input
            {...control}
            autoComplete="email"
            maxLength={CONTACT_MAX}
            type="email"
            value={draft.contactEmail}
            onChange={(event) => onChange({ contactEmail: event.target.value })}
          />
        )}
      </FormField>
    </div>
  )
}
