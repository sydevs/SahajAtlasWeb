import {
  type Control,
  type FieldErrors,
  type UseFormRegister,
  type UseFormRegisterReturn,
  Controller,
  useForm,
} from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { DateTime } from 'luxon'
import { useTranslation } from 'react-i18next'
import { type ReactNode, useState } from 'react'
import clsx from 'clsx'

import { Button } from '@/components/atoms/Button'
import { Alert } from '@/components/atoms/Alert'
import { Checkbox } from '@/components/atoms/Checkbox'
import { Select, SelectItem } from '@/components/atoms/Select'
import { ShareContent } from '@/components/molecules/ShareContent'
import api from '@/config/api'
import { Registration, RegistrationSchema } from '@/types'
import { useLocale } from '@/hooks/use-locale'

export type RegistrationFormProps = {
  eventId: number
  upcomingDates: Date[]
  questions: string[]
  isOnline: boolean
  eventTitle: string
  eventUrl: string
  /** Optional close callback; the footer also closes the enclosing Modal via ModalClose. */
  onClose?: () => void
}

/**
 * The event registration form — generic and config-driven (no Event coupling).
 * It owns the form state, the createRegistration mutation, and the thank-you /
 * error / online-notice states, rendered as plain content in the RegistrationView
 * drawer body (the drawer supplies the chrome). `onClose` returns to the event.
 *
 * The drawer unmounts its content on close, so this remounts fresh on each reopen
 * — no manual reset-on-close needed.
 */
export function RegistrationForm({
  eventId,
  upcomingDates,
  questions,
  isOnline,
  eventTitle,
  eventUrl,
  onClose,
}: RegistrationFormProps) {
  const [submitted, setSubmitted] = useState(false)
  const { t } = useTranslation('events')

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<Registration>({ resolver: zodResolver(RegistrationSchema) })

  const mutation = useMutation({
    scope: { id: `registration-for-${eventId}` },
    mutationFn: (newRegistration: Registration) => {
      return api.createRegistration(eventId, newRegistration)
    },
    onSuccess: () => setSubmitted(true),
  })

  return (
    <form className="flex flex-col gap-3" onSubmit={handleSubmit((data) => mutation.mutate(data))}>
      {submitted ? (
        <div className="flex flex-col gap-3 text-center">
          <p>{t('registration.followup')}</p>
          <div className="mt-2 font-semibold">{t('registration.invite_friend')}</div>
          <ShareContent label={eventTitle} url={eventUrl} />
        </div>
      ) : (
        <>
          <RegistrationFields
            control={control}
            errors={errors}
            questions={questions}
            register={register}
            upcomingDates={upcomingDates}
          />

          {mutation.isError && (
            <Alert
              className="mt-4"
              color="secondary"
              description={mutation.error.message}
              title="Something went wrong"
            />
          )}
        </>
      )}

      {isOnline && (
        <Alert
          hideIcon
          className="mt-3"
          color="primary"
          description={t('registration.online_notice')}
          title={t('registration.online_notice_title')}
          variant="bordered"
        />
      )}

      <div className="mt-2 flex justify-end gap-2">
        {submitted ? (
          <Button color="primary" variant="flat" onClick={onClose}>
            {t('registration.okay')}
          </Button>
        ) : (
          <>
            <Button disabled={mutation.isPending} variant="flat" onClick={onClose}>
              {t('registration.cancel')}
            </Button>
            <Button color="primary" isLoading={mutation.isPending} type="submit" variant="flat">
              {t('registration.submit')}
            </Button>
          </>
        )}
      </div>
    </form>
  )
}

// Shared field chrome (label + control + error) — single-use compositions kept
// private to the registration form.
const FIELD_INPUT =
  'w-full h-10 rounded-none border bg-background px-3 text-sm text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-focus'

function Field({
  label,
  required,
  error,
  htmlFor,
  children,
}: {
  label: ReactNode
  required?: boolean
  error?: ReactNode
  htmlFor?: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium" htmlFor={htmlFor}>
        {label}
        {required && ' *'}
      </label>
      {children}
      {error && <span className="text-xs text-danger-11">{error}</span>}
    </div>
  )
}

function LabeledInput({
  label,
  required,
  error,
  type = 'text',
  registration,
}: {
  label: ReactNode
  required?: boolean
  error?: ReactNode
  type?: string
  registration: UseFormRegisterReturn
}) {
  return (
    <Field error={error} htmlFor={registration.name} label={label} required={required}>
      <input
        className={clsx(FIELD_INPUT, error ? 'border-danger-7' : 'border-gray-7')}
        id={registration.name}
        type={type}
        {...registration}
      />
    </Field>
  )
}

function LabeledTextarea({
  label,
  error,
  registration,
}: {
  label: ReactNode
  error?: ReactNode
  registration: UseFormRegisterReturn
}) {
  return (
    <Field error={error} htmlFor={registration.name} label={label}>
      <textarea
        className={clsx(FIELD_INPUT, 'h-auto py-2', error ? 'border-danger-7' : 'border-gray-7')}
        id={registration.name}
        rows={3}
        {...registration}
      />
    </Field>
  )
}

type RegistrationFieldsProps = {
  upcomingDates: Date[]
  questions: string[]
  register: UseFormRegister<Registration>
  control: Control<Registration>
  errors: FieldErrors<Registration>
}

function RegistrationFields({
  upcomingDates,
  questions,
  register,
  control,
  errors,
}: RegistrationFieldsProps) {
  const { t } = useTranslation('events')
  const { locale } = useLocale()

  return (
    <div className="flex flex-col gap-4">
      {/* The form value is the ISO string; RegistrationSchema's z.coerce.date()
          turns it into a Date on submit, so we bridge the controlled Radix Select
          through a Controller and cast across that string↔Date coercion seam. */}
      <Controller
        control={control}
        defaultValue={upcomingDates[0]?.toISOString() as unknown as Date}
        name="startingAt"
        render={({ field }) => (
          <Field
            required
            error={errors.startingAt && t('errors.starting_at')}
            label={t('registration.starting_date')}
          >
            <Select
              ariaLabel={t('registration.starting_date')}
              isInvalid={!!errors.startingAt}
              value={field.value as unknown as string}
              onBlur={field.onBlur}
              onValueChange={field.onChange}
            >
              {upcomingDates.map((date) => {
                const dateTime = DateTime.fromJSDate(date).setLocale(locale)

                return (
                  <SelectItem
                    key={date.toISOString()}
                    className="capitalize"
                    textValue={dateTime.toLocaleString(DateTime.DATETIME_MED_WITH_WEEKDAY)}
                    value={date.toISOString()}
                  >
                    {dateTime.toRelativeCalendar()} -{' '}
                    {dateTime.toLocaleString(DateTime.DATE_MED_WITH_WEEKDAY)}
                  </SelectItem>
                )
              })}
            </Select>
          </Field>
        )}
        rules={{ required: true }}
      />

      <LabeledInput
        required
        error={errors.name && t('errors.name')}
        label={t('registration.name')}
        registration={register('name', { required: true })}
        type="text"
      />

      <LabeledInput
        required
        error={errors.email && t('errors.email')}
        label={t('registration.email')}
        registration={register('email', { required: true })}
        type="email"
      />

      {questions.map((question, index) => (
        <LabeledTextarea
          key={index}
          error={errors.questions?.[question]?.message}
          label={t(`questions.${question}`)}
          registration={register(`questions.${question}`)}
        />
      ))}

      {/* Opt-in mailing-list consent — a checkbox-appearance toggle, unchecked by
          default, shown just above the privacy note. */}
      <Controller
        control={control}
        defaultValue={false}
        name="subscribe"
        render={({ field }) => (
          <Checkbox
            appearance="checkbox"
            checked={!!field.value}
            color="primary"
            onCheckedChange={field.onChange}
          >
            {t('registration.mailing_list_consent')}
          </Checkbox>
        )}
      />

      <p className="text-xs text-center">{t('registration.privacy_policy')}</p>
    </div>
  )
}
