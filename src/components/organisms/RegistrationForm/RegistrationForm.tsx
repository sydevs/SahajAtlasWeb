import type { TranslationKey } from '@/types/i18next'
import type { IcsEventInput } from '@/lib/ics'
import type { EventRegistrationErrorCode } from '@/types/payload/response-types'

import {
  type Control,
  type FieldError,
  type FieldErrors,
  type UseFormRegister,
  type UseFormRegisterReturn,
  type UseFormTrigger,
  Controller,
  useForm,
} from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { DateTime } from 'luxon'
import { useTranslation } from 'react-i18next'
import { Check, ChevronDown } from 'lucide-react'
import clsx from 'clsx'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/atoms/Button'
import { Alert } from '@/components/atoms/Alert'
import { Checkbox } from '@/components/atoms/Checkbox'
import { Link } from '@/components/atoms/Link'
import { RadioGroup, type RadioOption } from '@/components/atoms/RadioGroup'
import { fieldChrome } from '@/components/atoms/Select'
import { AddToCalendar } from '@/components/molecules/AddToCalendar'
import { FormField, fieldErrorId } from '@/components/molecules/FormField'
import { INPUT_REFUSAL_KEYS } from '@/components/organisms/ReportIssueForm/refusal-copy'
import { ShareContent } from '@/components/molecules/ShareContent'
import api from '@/config/api'
import {
  type RegistrationErrorCode,
  RegistrationRefusedError,
  USER_SUBMISSION_VALUE_MAX,
} from '@/config/api/mutate'
import livePreview from '@/config/live-preview/protocol'
import { useRegistrationDraft } from '@/config/store'
import {
  RecurrenceType,
  Registration,
  RegistrationInput,
  RegistrationQuestionName,
  RegistrationSchema,
} from '@/types'
import { useLocale } from '@/hooks/use-locale'
import { useTurnstile } from '@/hooks/use-turnstile'
import { useViewerCountry } from '@/hooks/use-viewer-country'

const PRIVACY_POLICY_URL = 'https://wemeditate.com/privacy'

/**
 * This is our copy for each **state** refusal SahajCloud can return (409 and
 * `code`, SahajCloud#601). The endpoint's own messages are English-only
 * prose. This is typed as a total Record over the synced union, so a
 * `pnpm types:cms` that adds or renames a code fails the build here,
 * instead of silently degrading to the generic error. Three of the four
 * reuse the display copy the panel already shows for the same state, so the
 * form and the panel cannot word it differently.
 */
const STATE_MESSAGE_KEYS: Record<EventRegistrationErrorCode, TranslationKey> = {
  external_registration: 'event.display.registration_external',
  event_ended: 'event.display.event_ended',
  registration_closed: 'event.display.registration_closed',
  event_full: 'event.display.event_full',
}

/**
 * This holds every code a `RegistrationRefusedError` can carry, so a caller finds a
 * refusal's copy once rather than treating one kind as a special case.
 *
 * It splits in two only so the half above stays total over the SYNCED union. That
 * totality is what makes a `types:cms` re-sync fail the build here, rather than
 * silently routing a new code to the generic sentence.
 *
 * `event_not_found` borrows the sentence the fallback panel already shows for a class
 * that cannot be joined: the event left the caller's view since the read. The three
 * input refusals borrow the report form's own words (#259).
 */
const REFUSAL_MESSAGE_KEYS: Record<RegistrationErrorCode, TranslationKey> = {
  ...STATE_MESSAGE_KEYS,
  event_not_found: 'common.errors.unavailable',
  ...INPUT_REFUSAL_KEYS,
  captcha_failed: 'registration.form.captcha_retry',
  captcha_unavailable: 'registration.form.captcha_retry',
  content_unscannable: 'registration.form.captcha_retry',
}

/**
 * The refusals that mean our cached event is stale, so it is refetched. The
 * rest are about the request or the visitor's input, not the event.
 */
const EVENT_REFUSALS: ReadonlySet<string> = new Set([
  ...Object.keys(STATE_MESSAGE_KEYS),
  'event_not_found',
])

// `code` is a cast over a `z.string()`, so at runtime it is whatever the
// response body said. A bare lookup walks the prototype chain, and a code of
// `constructor` would hand `t()` a function.
const hasOwn = (table: object, key: string) => Object.prototype.hasOwnProperty.call(table, key)

const refusalKey = (error: unknown): TranslationKey | undefined =>
  error instanceof RegistrationRefusedError && hasOwn(REFUSAL_MESSAGE_KEYS, error.code)
    ? REFUSAL_MESSAGE_KEYS[error.code]
    : undefined

/** A field error set from a refusal, as opposed to one the schema raised. */
const REFUSED = 'refused'

type RefusableField = 'email' | 'name' | `questions.${RegistrationQuestionName}`

/**
 * The form field a refusal is about, when the visitor can fix it there.
 *
 * SahajCloud names the input as `field`: `senderEmail` for the address (or
 * `email`, when the sender's `users` row refused it), and the `submissionData`
 * key for an answer that carried a link. An address refusal always means the
 * one email field, named or not.
 */
const refusedField = (
  error: unknown,
  questions: RegistrationQuestionName[],
): RefusableField | undefined => {
  if (!(error instanceof RegistrationRefusedError) || !hasOwn(INPUT_REFUSAL_KEYS, error.code))
    return undefined

  if (error.code === 'invalid_email' || error.code === 'disposable_email') return 'email'

  if (error.field === 'name') return 'name'

  const question = questions.find((name) => name === error.field)

  return question ? `questions.${question}` : undefined
}

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
  /**
   * What was registered for, shown on the confirmation under the success line. RegistrationView
   * hands over the same facts card it shows above the form, so the success line leads that screen.
   */
  summary?: ReactNode
  /** Tells the view the registration went through, so its header can say so. */
  onSubmitted?: () => void
  /** Start in the post-submit confirmation state — for previewing that screen in a
   *  story without a real submission. Defaults to false (the live form). */
  initialSubmitted?: boolean
  /**
   * Story-only: render this refusal as if SahajCloud had just returned it. The story
   * builds the error, because the playground has no solved challenge to submit through
   * and no SDK boundary to reject at — unlike `RegistrationForm.submit.test.tsx`.
   */
  initialRefusal?: RegistrationRefusedError
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
  summary,
  onSubmitted,
  initialSubmitted = false,
  initialRefusal,
}: RegistrationFormProps) {
  const [submitted, setSubmitted] = useState(initialSubmitted)
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [wantsOtherClasses, setWantsOtherClasses] = useState(false)
  const { locale } = useLocale()
  // The viewer's region orders the share targets on the thank-you screen (resolved
  // here so ShareContent stays a pure, prop-driven molecule).
  const country = useViewerCountry()
  // In live preview, the event is a draft. Previewing must never create a
  // real registration, so this disables the submit and short-circuits
  // `mutate()`.
  const isPreview = livePreview.active

  // This restores any in-progress values for this event once, so a drawer
  // remount (for example, the md-crossing direction remount) cannot drop a
  // half-filled form.
  const [defaultValues] = useState<Partial<RegistrationInput>>(() => {
    const draft = useRegistrationDraft.getState()

    return draft.eventId === eventId ? (draft.values as Partial<RegistrationInput>) : {}
  })

  const {
    register,
    control,
    handleSubmit,
    setError,
    trigger,
    watch,
    formState: { errors },
    // The three generics are what keep the coercion honest: the fields hold the INPUT shape
    // (`startingAt` is the ISO string below), and only `handleSubmit` is handed a `Registration`.
  } = useForm<RegistrationInput, unknown, Registration>({
    resolver: zodResolver(RegistrationSchema),
    defaultValues,
  })

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
  // The frame only says when the check has passed, never that it wants an answer. So a wait this
  // long is taken to mean the visitor may have something to do, and the line under Register says so.
  const [checkIsSlow, setCheckIsSlow] = useState(false)

  useEffect(() => {
    setCheckIsSlow(false)
    if (token) return

    const timer = window.setTimeout(() => setCheckIsSlow(true), CHECK_PATIENCE_MS)

    return () => window.clearTimeout(timer)
  }, [token])

  // A refusal the visitor can fix in one field lands ON that field, the way a
  // schema error does: the sentence under it, `aria-invalid`, and focus moved
  // there. Editing the field re-validates it, which clears this.
  const flagRefusal = (error: unknown, focus: boolean) => {
    const field = refusedField(error, questions)
    const key = refusalKey(error)

    if (field && key) setError(field, { type: REFUSED, message: key }, { shouldFocus: focus })
  }

  useEffect(() => {
    if (initialRefusal) flagRefusal(initialRefusal, false)
    // Mount-only: the story's refusal never changes.
  }, [])

  const mutation = useMutation({
    scope: { id: `registration-for-${eventId}` },
    mutationFn: ({ registration, captcha }: { registration: Registration; captcha: string }) => {
      return api.createRegistration(eventId, registration, captcha)
    },
    onSuccess: () => {
      setSubmitted(true)
      onSubmitted?.()
      useRegistrationDraft.getState().clearDraft()
    },
    onError: (error) => {
      // A Turnstile token is single-use, and the server redeems it before
      // doing the work it gates. So once a request reaches the captcha check
      // the token is spent, whether or not it was the reason for the failure,
      // and re-sending it would be refused for the rest of this form's life.
      // This resets on EVERY failure, coded or not: a 500 after the guard
      // spends the token too, and a failure that stopped earlier (the address
      // checks run first) costs only a fresh challenge. The fallback copy
      // promises exactly this reset.
      resetChallenge()

      if (!(error instanceof RegistrationRefusedError)) return

      flagRefusal(error, true)

      // A state refusal means our cached event disagrees with the server
      // about whether it can be joined — it filled up, ended, or its course
      // started since the read. This refetches it, so the surfaces behind
      // this form flip to the real state, instead of continuing to offer a
      // Register button. This uses a prefix key, since the event is cached
      // per locale (`['event', id, locale]`).
      if (EVENT_REFUSALS.has(error.code)) {
        void queryClient.invalidateQueries({ queryKey: ['event', eventId] })
      }
    },
  })

  // The form collapses to a much shorter screen on success. Moving focus to the success line
  // brings it into view from wherever Register was, and tells a screen reader what happened.
  const confirmationRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (submitted && !initialSubmitted) confirmationRef.current?.focus()
  }, [submitted, initialSubmitted])

  const registered = mutation.variables?.registration

  // A refused registration renders OUR copy for the reason, never the
  // endpoint's English prose, and never the thrown message, which is
  // developer text. Anything else — offline, a 5xx, a code this build does
  // not know — keeps the generic title, but says what to do next: the
  // challenge has been reset under the viewer, so wait for it and register
  // again, the same move the report form's own catch-all names.
  const refusal = mutation.error ?? initialRefusal
  const refusalMessage = refusalKey(refusal)
  // A field refusal is already said, and announced, on its field.
  const showAlert = refusal != null && !refusedField(refusal, questions)

  return (
    <form
      noValidate
      className="mx-auto flex w-full max-w-md flex-col gap-4"
      onSubmit={handleSubmit((data) => {
        // `token` is also what gates the submit button, so this check is an
        // extra safeguard for the Enter-key path. It is also what makes
        // `captcha` a plain string, rather than a nullable one, all the way
        // down to the header.
        if (!isPreview && token) mutation.mutate({ registration: data, captcha: token })
      })}
    >
      {submitted ? (
        <div className="flex flex-col gap-5">
          <div
            ref={confirmationRef}
            className="flex scroll-mt-4 items-start gap-3 outline-none"
            role="status"
            tabIndex={-1}
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-9 text-primary-foreground">
              <Check aria-hidden size={16} strokeWidth={3} />
            </span>
            <div className="flex flex-col gap-0.5 text-base">
              {registered && (
                <p className="font-medium">
                  {t('registration.form.see_you', {
                    date: longDate(registered.startingAt, timeZone, locale),
                  })}
                </p>
              )}
              <p className="text-gray-11">
                {registered
                  ? t('registration.form.confirm_email', { email: registered.email })
                  : t('registration.form.followup')}
              </p>
            </div>
          </div>

          {summary}

          {/* This is the moment calendar export is most wanted (issue #105).
              `calendar` is optional, so the form stays generic: it takes
              export primitives from RegistrationView, never an Event. This
              anchors on the session that was actually submitted —
              `mutation.variables` holds it, so this needs no extra state.
              It uses the next occurrence instead, when the confirmation is
              being previewed rather than earned. */}
          {calendar && <AddToCalendar event={{ ...calendar, from: registered?.startingAt }} />}

          {/* No link, no row. "Invite a friend" over nothing to press is a worse
              confirmation screen than one that simply does not offer it. */}
          {eventUrl && (
            <InviteFriend>
              <ShareContent country={country} label={eventTitle} url={eventUrl} />
            </InviteFriend>
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
            trigger={trigger}
            upcomingDates={upcomingDates}
          />

          {/* This is the challenge itself. It renders under the fields and
              above the error, so the one thing that can silently hold the
              submit button disabled stays visible immediately above it,
              rather than down in the footer. */}
          <div ref={challengeRef} className="empty:hidden" />

          {/* A refusal is not a malfunction, so it states its reason on its
              own, without the "Something went wrong" framing or the
              endpoint's English message. */}
          {showAlert && (
            <Alert
              color="secondary"
              description={refusalMessage ? undefined : t('registration.form.captcha_retry')}
              role="alert"
              title={t(refusalMessage ?? 'registration.form.error_title')}
            />
          )}

          {/* PROPOSAL, pending a qualified GDPR check. Registering no longer doubles as consent
              to other mail: that is a separate box, off by default.

              ⚠ The box is not sent anywhere yet. `submissionData` keys must exist in SahajCloud's
              collection first (`mutate.ts`), and the server has to honour it (#147). Do not ship
              this without that, or the box promises something nothing keeps. */}
          <Checkbox
            appearance="checkbox"
            checked={wantsOtherClasses}
            onCheckedChange={setWantsOtherClasses}
          >
            <span className="text-sm">{t('registration.form.subscribe')}</span>
          </Checkbox>
          {/* The link is 44px tall for a thumb, in a line that is otherwise easy to miss. */}
          <p className="-my-2 text-sm text-gray-11">
            {t('registration.form.consent_class')}{' '}
            <Link
              isExternal
              className="min-h-11 font-medium text-primary-12 underline underline-offset-2"
              href={PRIVACY_POLICY_URL}
            >
              {t('registration.form.privacy_link')}
            </Link>
          </p>
        </>
      )}

      {isOnline && (
        <Alert
          color="primary"
          description={t('registration.form.online_notice')}
          icon={false}
          title={t('registration.form.online_notice_title')}
          variant="bordered"
        />
      )}

      {!submitted && (
        // Always in reach, the same full-width solid as Register on the class page. The offset is
        // how far this scroller's bottom edge sits below the screen: the sheet's drag offset, less
        // the 3% bottom padding the sheet carries. The drawer's X is the way out.
        <div className="sticky bottom-[max(0px,calc(var(--sy-sheet-top,0px)_-_var(--sy-frame-h,0px)*0.03))] z-10 -mx-4 flex flex-col gap-1.5 border-t border-divider bg-background px-4 pt-3 pb-[max(8px,env(safe-area-inset-bottom))]">
          {/* No token means no registration the server would accept. So the
              button stays disabled until the challenge is solved — the
              same contract the report form has always had. A blocked
              challenge never reaches this: it fails the widget at
              `useTurnstileGuard` instead. */}
          <Button
            className="w-full"
            color="primary"
            disabled={isPreview || !token}
            isLoading={mutation.isPending}
            size="lg"
            type="submit"
            variant="solid"
          >
            <span className="text-base font-semibold">{t('registration.form.submit')}</span>
          </Button>
          {/* A pale button with no reason given reads as a broken form. The line keeps its height
              when empty, so Register does not move just as it becomes tappable. */}
          <p aria-live="polite" className="min-h-5 text-center text-sm text-gray-11">
            {isPreview || token
              ? ''
              : t(checkIsSlow ? 'registration.form.security_check' : 'registration.form.checking')}
          </p>
        </div>
      )}
    </form>
  )
}

/** The confirmation's one quiet way to pass the class on: closed until asked for. */
function InviteFriend({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  return (
    <section className="border-t border-divider">
      <button
        aria-expanded={open}
        className="flex min-h-14 w-full items-center justify-between gap-3 text-start text-base font-medium outline-none focus-visible:ring-2 focus-visible:ring-focus"
        type="button"
        onClick={() => setOpen(!open)}
      >
        {t('registration.form.invite_friend')}
        <ChevronDown
          aria-hidden
          className={clsx('shrink-0 text-gray-11 transition-transform', open && 'rotate-180')}
          size={20}
        />
      </button>
      {open && <div className="pb-4">{children}</div>}
    </section>
  )
}

/**
 * A field's error sentence: a refusal's own copy, which travels as its key,
 * or else the schema's sentence for that field.
 */
const errorCopy = (
  error: FieldError | undefined,
  t: (key: TranslationKey) => string,
  schemaKey?: TranslationKey,
) => {
  if (!error) return undefined

  if (error.type === REFUSED) return t(error.message as TranslationKey)

  return schemaKey ? t(schemaKey) : error.message
}

// The label, control, and error shell is the shared `FormField` molecule,
// also used by the report-issue form. So the required marker and the
// aria-describedby id convention are defined once. The control's chrome
// comes from the shared `fieldChrome` recipe, so these inputs match the
// Select and the filter date bounds.

// 48px tall, an easy target on a phone. `fieldChrome` keeps the 40px default for denser filters.
const TALL_FIELD = 'h-12'

function LabeledInput({
  label,
  maxLength,
  error,
  type = 'text',
  autoComplete,
  inputMode,
  registration,
}: {
  label: ReactNode
  maxLength?: number
  error?: ReactNode
  type?: string
  /** Lets the phone offer the visitor's own name and address. */
  autoComplete?: string
  inputMode?: 'email' | 'text'
  registration: UseFormRegisterReturn
}) {
  return (
    <FormField error={error} htmlFor={registration.name} label={label}>
      <input
        aria-required
        aria-describedby={error ? fieldErrorId(registration.name) : undefined}
        aria-invalid={error ? true : undefined}
        autoComplete={autoComplete}
        className={fieldChrome({ isInvalid: Boolean(error), class: TALL_FIELD })}
        id={registration.name}
        inputMode={inputMode}
        maxLength={maxLength}
        type={type}
        {...registration}
      />
    </FormField>
  )
}

function LabeledTextarea({
  label,
  maxLength,
  error,
  registration,
}: {
  label: ReactNode
  maxLength?: number
  error?: ReactNode
  registration: UseFormRegisterReturn
}) {
  return (
    <FormField optional error={error} htmlFor={registration.name} label={label}>
      <textarea
        aria-describedby={error ? fieldErrorId(registration.name) : undefined}
        aria-invalid={error ? true : undefined}
        className={fieldChrome({ isInvalid: Boolean(error), multiline: true })}
        id={registration.name}
        maxLength={maxLength}
        rows={2}
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
  register: UseFormRegister<RegistrationInput>
  control: Control<RegistrationInput, unknown, Registration>
  errors: FieldErrors<RegistrationInput>
  trigger: UseFormTrigger<RegistrationInput>
}

function RegistrationFields({
  upcomingDates,
  timeZone,
  recurrenceType,
  questions,
  register,
  control,
  errors,
  trigger,
}: RegistrationFieldsProps) {
  const { t } = useTranslation()
  const { locale } = useLocale()

  const startingDates = useMemo(
    () => dateOptions(upcomingDates, recurrenceType, timeZone, locale),
    [upcomingDates, recurrenceType, timeZone, locale],
  )
  // Most people take the next class, so the date reads as an answer already given, with the
  // list one tap away. That leaves name and email as the whole of the form. A date error
  // opens the list, since the visitor has something to do there.
  const [pickingDate, setPickingDate] = useState(false)
  const showDateList = pickingDate || Boolean(errors.startingAt) || startingDates.length === 0

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
            error={errors.startingAt && t('registration.errors.starting_at')}
            label={t('registration.form.first_class')}
          >
            {!showDateList ? (
              <div className="flex min-h-12 items-center justify-between gap-3 rounded border border-gray-7 ps-3 pe-1">
                <span className="min-w-0 text-base">
                  {startingDates.find((option) => option.value === String(field.value))?.label ??
                    startingDates[0]?.label}
                </span>
                {startingDates.length > 1 && (
                  <Button
                    className="h-11 text-primary-12"
                    color="primary"
                    variant="ghost"
                    onClick={() => setPickingDate(true)}
                  >
                    {t('registration.form.change_date')}
                  </Button>
                )}
              </div>
            ) : (
              <>
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
                  aria-label={t('registration.form.first_class')}
                  collapseAfter={VISIBLE_DATES}
                  isInvalid={!!errors.startingAt}
                  moreLabel={t('registration.form.show_more_dates')}
                  name={field.name}
                  options={startingDates}
                  value={field.value as unknown as string}
                  onBlur={field.onBlur}
                  onChange={field.onChange}
                />
              </>
            )}
          </FormField>
        )}
        rules={{ required: true }}
      />

      <LabeledInput
        autoComplete="name"
        error={errorCopy(errors.name, t, 'registration.errors.name')}
        label={t('registration.form.name')}
        maxLength={USER_SUBMISSION_VALUE_MAX}
        registration={register('name', { required: true })}
        type="text"
      />

      <LabeledInput
        autoComplete="email"
        error={errorCopy(errors.email, t, 'registration.errors.email')}
        inputMode="email"
        label={t('registration.form.email')}
        // A typo in the address is worth saying as soon as they leave the field. An empty field is
        // not: that may just be someone looking around, and it waits for Register.
        registration={register('email', {
          required: true,
          onBlur: (event) => {
            if (event.target.value) void trigger('email')
          },
        })}
        type="email"
      />

      {questions.map((question, index) => (
        <LabeledTextarea
          key={index}
          error={errorCopy(errors.questions?.[question], t)}
          label={t(`registration.questions.${question}`)}
          maxLength={USER_SUBMISSION_VALUE_MAX}
          registration={register(`questions.${question}`)}
        />
      ))}
    </div>
  )
}

/** How long the security check may run quietly before the visitor is told it may need them. */
const CHECK_PATIENCE_MS = 4000

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

const sentenceCase = (text: string) => text.charAt(0).toLocaleUpperCase() + text.slice(1)

/** "Tuesday, November 10" in the class's own zone, for the confirmation line. */
const longDate = (date: Date, timeZone: string | undefined, locale: string) =>
  DateTime.fromJSDate(date)
    .setZone(timeZone ?? 'local')
    .setLocale(locale)
    .toLocaleString({ weekday: 'long', month: 'long', day: 'numeric' })

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
        <span>
          {dateTime.toLocaleString({ weekday: 'short', month: 'short', day: 'numeric' })}
          <span className="font-normal opacity-80">
            {' · '}
            {sentenceCase(dateTime.toRelativeCalendar(unit ? { unit } : undefined) ?? '')}
          </span>
        </span>
      ),
    }
  })
}
