import { useTranslation } from 'react-i18next'

import { type StepProps, CONTACT_MAX, ValidatedInput } from './fields'

export function ContactStep({ draft, errors = {}, onChange }: StepProps) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-md font-semibold">{t('submit.contact.title')}</h3>
        <p className="text-sm text-gray-11">{t('submit.contact.help')}</p>
      </div>
      <ValidatedInput
        autoComplete="name"
        id="submit-contact-name"
        label={t('submit.contact.name_label')}
        maxLength={CONTACT_MAX}
        value={draft.contactName}
        onChange={(event) => onChange({ contactName: event.target.value })}
      />
      <ValidatedInput
        autoComplete="tel"
        id="submit-contact-phone"
        label={t('submit.contact.phone_label')}
        maxLength={CONTACT_MAX}
        type="tel"
        value={draft.contactPhone}
        onChange={(event) => onChange({ contactPhone: event.target.value })}
      />
      <ValidatedInput
        autoComplete="email"
        error={errors.contactEmail && t('submit.errors.email')}
        id="submit-contact-email"
        label={t('submit.contact.email_label')}
        maxLength={CONTACT_MAX}
        type="email"
        value={draft.contactEmail}
        onChange={(event) => onChange({ contactEmail: event.target.value })}
      />
    </div>
  )
}
