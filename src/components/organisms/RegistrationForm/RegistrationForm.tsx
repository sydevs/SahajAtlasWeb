import type { IcsEventInput } from '@/lib/ics'
import type { EventRegistrationErrorCode } from '@/types/payload/response-types'

import {
  type Control,
  type FieldErrors,
  type UseFormRegister,
  type UseFormRegisterReturn,
  Controller,
  useForm,
} from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { DateTime } from 'luxon'
import { useTranslation } from 'react-i18next'
import { type ReactNode, useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/atoms/Button'
import { Alert } from '@/components/atoms/Alert'
import { RadioGroup, type RadioOption } from '@/components/atoms/RadioGroup'
import { fieldChrome } from '@/components/atoms/Select'
import { AddToCalendar } from '@/components/molecules/AddToCalendar'
import { FormField, fieldErrorId } from '@/components/molecules/FormField'
import { ShareContent } from '@/components/molecules/ShareContent'
import api from '@/config/api'
import { type RegistrationErrorCode, RegistrationRefusedError } from '@/config/api/mutate'
import preview from '@/config/preview'
import { useRegistrationDraft } from '@/config/store'
import { RecurrenceType, Registration, RegistrationQuestionName, RegistrationSchema } from '@/types'
import { useLocale } from '@/hooks/use-locale'
import { useTurnstile } from '@/hooks/use-turnstile'
import { useViewerCountry } from '@/hooks/use-viewer-country'

/**
 * This is our copy for each **state** refusal SahajCloud can return (409 and
 * `code`, SahajCloud#601). The endpoint's own messages are English-only
 * prose. This is typed as a total Record over the synced union, so a
 * `pnpm types:cms` that adds or renames a code fails the build here,
 * instead of silently degrading to the generic error. Three of the four
 * reuse the display copy the panel already shows for the same state, so the
 * form and the panel cannot word it differently.
 */
const STATE_MESSAGE_KEYS: Record<EventRegistrationErrorCode, string> = {
  external_registration: 'display.registration_external',
  event_ended: 'display.event_ended',
  registration_closed: 'display.registration_closed',
  event_full: 'display.event_full',
}

/**
 * This holds every code a `RegistrationRefusedError` can carry — the state
 * refusals plus the captcha one. This way, a caller finds a refusal's copy
 * once, rather than treating one kind as a special case.
 *
 * This splits in two only so the half above stays total over the SYNCED
 * union. That totality is what makes a `types:cms` re-sync fail the build
 * here, rather than silently routing a new code to the generic sentence.
 * Folding a code from a different layer into it would lose that check.
 * SahajCloud's write guard throws `captcha_failed` one layer up.
 */
const REFUSAL_MESSAGE_KEYS: Record<RegistrationErrorCode, string> = {
  ...STATE_MESSAGE_KEYS,
  captcha_failed: 'registration.captcha_retry',
}

/**
 * This is the one refusal that is not about the event. So it is also the
 * one that must not invalidate the cached event below. It is an ordinary
 * `RegistrationRefusedError` code, like any other.
 */
const CAPTCHA_REFUSED: RegistrationErrorCode = 'captcha_failed'

export type RegistrationFormProps = {
  eventId: number
  upcomingDates: Date[]
  questions: RegistrationQuestionName[]
  isOnline: boolean
  eventTitle: string
  /**
   * This is the event's link, for the confirmation screen's
   * invite-a-friend block. It is **optional**, and the block drops without
   * it (issue #115). An event with no canonical page, viewed on a host page
   * the widget routes off-URL on, has no URL that identifies it. The only
   * string in reach is then the host page's own address, which would send
   * the friend to somebody's article instead. `ShareContent` keeps its
   * `url` REQUIRED for the same reason: a share block is a URL plus ways to
   * send it, so there is no such thing as one without a URL. The caller
   * with no link renders no block.
   */
  eventUrl?: string
  /**
   * These are export primitives for the confirmation screen's
   * add-to-calendar block (issue #105). This is optional, and deliberately
   * NOT an `Event`: the form stays config-driven, so RegistrationView builds
   * this from the full event doc. That doc is also the only place that HAS
   * the exclusion and untilDate fields the trimmed feed omits. When this
   * prop is absent, the block does not render.
   */
  calendar?: Omit<IcsEventInput, 'from'>
  /** This is the zone the starting-date options render in — the event's
   *  own zone for physical events, the viewer's zone for online events
   *  (issue #52 time contract). */
  timeZone?: string
  /** This is the event's recurrence (DAILY, WEEKLY, or MONTHLY), so the
   *  starting-date labels read in the class's own cadence ("Next week" and
   *  "Next month," for example). */
  recurrenceType?: RecurrenceType | null
  /** This is an optional close callback. The footer also closes the
   *  enclosing Modal via ModalClose. */
  onClose?: () => void
  /** Start in the post-submit confirmation state — for previewing that screen in a
   *  story without a real submission. Defaults to false (the live form). */
  initialSubmitted?: boolean
}

/**
 * This is the event registration form: generic and config-driven, with no
 * Event coupling. It owns the form state, the createRegistration mutation,
 * and the thank-you, error, and online-notice states. It renders as plain
 * content in the RegistrationView drawer body — the drawer supplies the
 * chrome. `onClose` returns to the event.
 *
 * The drawer unmounts its content on close, so this remounts fresh on each
 * reopen. It needs no manual reset-on-close.
 */
export function RegistrationForm({
  eventId,
  upcomingDates,
  timeZone,
  recurrenceType,
  questions,
  isOnline,
  eventTitle,
  eventUrl,
  calendar,
  onClose,
  initialSubmitted = false,
}: RegistrationFormProps) {
  const [submitted, setSubmitted] = useState(initialSubmitted)
  const { t } = useTranslation('events')
  const queryClient = useQueryClient()
  // The viewer's region orders the share targets on the thank-you screen (resolved
  // here so ShareContent stays a pure, prop-driven molecule).
  const country = useViewerCountry()
  // In live preview, the event is a draft. Previewing must never create a
  // real registration, so this disables the submit and short-circuits
  // `mutate()`.
  const isPreview = preview.active

  // This restores any in-progress values for this event once, so a drawer
  // remount (for example, the md-crossing direction remount) cannot drop a
  // half-filled form.
  const [defaultValues] = useState<Partial<Registration>>(() => {
    const draft = useRegistrationDraft.getState()

    return draft.eventId === eventId ? (draft.values as Partial<Registration>) : {}
  })

  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<Registration>({ resolver: zodResolver(RegistrationSchema), defaultValues })

  // This persists edits to the hoisted draft, via getState() so it never re-renders.
  useEffect(() => {
    const sub = watch((values) =>
      useRegistrationDraft.getState().setDraft(eventId, values as Record<string, unknown>),
    )

    return () => sub.unsubscribe()
  }, [watch, eventId])

  // This is the challenge for this submission. `blocked` is not handled
  // here. `useTurnstileGuard` has already failed the whole widget by the
  // time a form could render in that state. So a per-form degradation would
  // be dead code, guarding a case its own boundary already swallowed (issue
  // #182).
  const { challengeRef, token, reset: resetChallenge } = useTurnstile()

  const mutation = useMutation({
    scope: { id: `registration-for-${eventId}` },
    mutationFn: ({ registration, captcha }: { registration: Registration; captcha: string }) => {
      return api.createRegistration(eventId, registration, captcha)
    },
    onSuccess: () => {
      setSubmitted(true)
      useRegistrationDraft.getState().clearDraft()
    },
    onError: (error) => {
      if (!(error instanceof RegistrationRefusedError)) return

      // A Turnstile token is single-use, and the server redeems it before
      // doing the work it gates. So the one in hand is spent, whether or not
      // it was the reason for the refusal, and re-sending it would be
      // refused for the rest of this form's life. This resets
      // unconditionally, rather than only on `captcha_failed`. Otherwise,
      // an `event_full` retry after a cancelled registration would fail
      // with a captcha error the viewer has no way to understand.
      resetChallenge()

      // A state refusal means our cached event disagrees with the server
      // about whether it can be joined — it filled up, ended, or its course
      // started since the read. This refetches it, so the surfaces behind
      // this form flip to the real state, instead of continuing to offer a
      // Register button. This uses a prefix key, since the event is cached
      // per locale (`['event', id, locale]`).
      if (error.code !== CAPTCHA_REFUSED) {
        void queryClient.invalidateQueries({ queryKey: ['event', eventId] })
      }
    },
  })

  // A refused registration renders OUR copy for the reason, not the
  // endpoint's English prose. An unrecognized code — a CMS newer than this
  // build — uses the generic error title and the server's message instead.
  // `code` is a cast over a `z.string()`, so at runtime it is whatever the
  // response body said.
  const refusalKey =
    mutation.error instanceof RegistrationRefusedError &&
    mutation.error.code in REFUSAL_MESSAGE_KEYS
      ? REFUSAL_MESSAGE_KEYS[mutation.error.code]
      : null

  const refusalMessage = refusalKey ? t(refusalKey) : null

  return (
    <form
      className="mx-auto flex w-full max-w-md flex-col gap-3"
      onSubmit={handleSubmit((data) => {
        // `token` is also what gates the submit button, so this check is an
        // extra safeguard for the Enter-key path. It is also what makes
        // `captcha` a plain string, rather than a nullable one, all the way
        // down to the header.
        if (!isPreview && token) mutation.mutate({ registration: data, captcha: token })
      })}
    >
      {submitted ? (
        <div className="flex flex-col gap-3 text-center">
          <p>{t('registration.followup')}</p>

          {/* This is the moment calendar export is most wanted (issue #105).
              `calendar` is optional, so the form stays generic: it takes
              export primitives from RegistrationView, never an Event. This
              anchors on the session that was actually submitted —
              `mutation.variables` holds it, so this needs no extra state.
              It uses the next occurrence instead, when the confirmation is
              being previewed rather than earned. */}
          {calendar && (
            <>
              <div className="mt-2 font-semibold">{t('actions.add_calendar')}</div>
              <AddToCalendar
                event={{ ...calendar, from: mutation.variables?.registration.startingAt }}
              />
            </>
          )}

          {/* This shows the heading and block together, or neither. "Invite a
              friend" over nothing to press is a worse confirmation screen
              than one that simply does not offer it. */}
          {eventUrl && (
            <>
              <div className="mt-2 font-semibold">{t('registration.invite_friend')}</div>
              <ShareContent country={country} label={eventTitle} url={eventUrl} />
            </>
          )}
        </div>
      ) : (
        <>
          <RegistrationFields
            control={control}
            errors={errors}
            questions={questions}
            recurrenceType={recurrenceType}
            register={register}
            timeZone={timeZone}
            upcomingDates={upcomingDates}
          />

          {/* This is the challenge itself. It renders under the fields and
              above the error, so the one thing that can silently hold the
              submit button disabled stays visible immediately above it,
              rather than down in the footer. */}
          <div ref={challengeRef} className="mt-4 empty:mt-0" />

          {/* A refusal is not a malfunction — the event simply cannot be
              joined — so it states the reason on its own. This drops both
              the "Something went wrong" framing and the endpoint's English
              message. */}
          {mutation.isError && (
            <Alert
              className="mt-4"
              color="secondary"
              description={refusalMessage ? undefined : mutation.error.message}
              role="alert"
              title={refusalMessage ?? t('registration.error_title')}
            />
          )}
        </>
      )}

      {isOnline && (
        <Alert
          className="mt-3"
          color="primary"
          description={t('registration.online_notice')}
          icon={false}
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
            {/* No token means no registration the server would accept. So the
                button stays disabled until the challenge is solved — the
                same contract the report form has always had. A blocked
                challenge never reaches this: it fails the widget at
                `useTurnstileGuard` instead. */}
            <Button
              color="primary"
              disabled={isPreview || !token}
              isLoading={mutation.isPending}
              type="submit"
              variant="flat"
            >
              {t('registration.submit')}
            </Button>
          </>
        )}
      </div>
    </form>
  )
}

// The label, control, and error shell is the shared `FormField` molecule,
// also used by the report-issue form. So the required marker and the
// aria-describedby id convention are defined once. The control's chrome
// comes from the shared `fieldChrome` recipe, so these inputs match the
// Select and the filter date bounds.

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
    <FormField error={error} htmlFor={registration.name} label={label} required={required}>
      <input
        aria-describedby={error ? fieldErrorId(registration.name) : undefined}
        aria-invalid={error ? true : undefined}
        className={fieldChrome({ isInvalid: Boolean(error) })}
        id={registration.name}
        type={type}
        {...registration}
      />
    </FormField>
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
    <FormField error={error} htmlFor={registration.name} label={label}>
      <textarea
        aria-describedby={error ? fieldErrorId(registration.name) : undefined}
        aria-invalid={error ? true : undefined}
        className={fieldChrome({ isInvalid: Boolean(error), multiline: true })}
        id={registration.name}
        rows={3}
        {...registration}
      />
    </FormField>
  )
}

type RegistrationFieldsProps = {
  upcomingDates: Date[]
  timeZone?: string
  recurrenceType?: RecurrenceType | null
  questions: RegistrationQuestionName[]
  register: UseFormRegister<Registration>
  control: Control<Registration>
  errors: FieldErrors<Registration>
}

function RegistrationFields({
  upcomingDates,
  timeZone,
  recurrenceType,
  questions,
  register,
  control,
  errors,
}: RegistrationFieldsProps) {
  const { t } = useTranslation('events')
  const { locale } = useLocale()

  const startingDates = useMemo(
    () => dateOptions(upcomingDates, recurrenceType, timeZone, locale),
    [upcomingDates, recurrenceType, timeZone, locale],
  )

  return (
    <div className="flex flex-col gap-4">
      {/* The form value is the ISO string. RegistrationSchema's z.coerce.date()
          turns it into a Date on submit, so the radio list's onChange stores
          the ISO string, and this casts across that string-to-Date coercion
          seam. */}
      <Controller
        control={control}
        defaultValue={upcomingDates[0]?.toISOString() as unknown as Date}
        name="startingAt"
        render={({ field }) => (
          <FormField
            required
            error={errors.startingAt && t('errors.starting_at')}
            label={t('registration.starting_date')}
          >
            {/* `field.ref` is what makes a failed submit MOVE (issue #102).
                react-hook-form focuses the first invalid field itself. That
                is `shouldFocusError`, on by default. But it can only focus a
                field it was handed a ref for, and it walks them in
                registration order, which here is the order they render in.

                This is the first field. Until RadioGroup forwarded a ref, it
                was the one field RHF had to skip. A submit with no date
                chosen moved focus nowhere and said nothing. So a
                screen-reader user was left on the Register button, with no
                sign of why it had not worked. The other two are plain
                `register`ed inputs, and were always covered. */}
            <RadioGroup
              ref={field.ref}
              aria-label={t('registration.starting_date')}
              collapseAfter={VISIBLE_DATES}
              isInvalid={!!errors.startingAt}
              moreLabel={t('registration.show_more_dates')}
              name={field.name}
              options={startingDates}
              value={field.value as unknown as string}
              onBlur={field.onBlur}
              onChange={field.onChange}
            />
          </FormField>
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

      <p className="text-center text-xs">{t('registration.privacy_policy')}</p>
    </div>
  )
}

// The starting-date picker shows the next `VISIBLE_DATES` occurrences up
// front. The RadioGroup atom collapses the rest behind a "show more" link.
const VISIBLE_DATES = 3

// This sets the relative-label unit per recurrence, so the options read in
// the class's own cadence. For weekly: "This week," "Next week," "In 2
// weeks." For daily: "Today," "Tomorrow," "In 2 days." For monthly: "This
// month," "Next month," and so on. This replaces Luxon's auto unit, which
// drifts ("in 6 days," then "next month"). A one-off or course, with no
// recurrence, keeps the auto unit.
const RELATIVE_UNIT: Record<RecurrenceType, 'days' | 'weeks' | 'months'> = {
  DAILY: 'days',
  WEEKLY: 'weeks',
  MONTHLY: 'months',
}

function dateOptions(
  dates: Date[],
  recurrenceType: RecurrenceType | null | undefined,
  timeZone: string | undefined,
  locale: string,
): RadioOption[] {
  const unit = recurrenceType ? RELATIVE_UNIT[recurrenceType] : undefined

  return dates.map((date) => {
    const dateTime = DateTime.fromJSDate(date)
      .setZone(timeZone ?? 'local')
      .setLocale(locale)

    return {
      value: date.toISOString(),
      label: (
        <span className="capitalize">
          {dateTime.toRelativeCalendar(unit ? { unit } : undefined)} -{' '}
          {dateTime.toLocaleString(DateTime.DATE_MED_WITH_WEEKDAY)}
        </span>
      ),
    }
  })
}
