import type { TranslationKey } from '@/types/i18next'
import type { IcsEventInput } from '@/lib/ics'
import type { EventRegistrationErrorCode } from '@/types/payload/response-types'

import {
  type Control,
  type FieldError,
  type FieldErrors,
  type UseFormRegister,
  type UseFormTrigger,
  Controller,
  useForm,
} from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { DateTime } from 'luxon'
import { useTranslation } from 'react-i18next'
import { Check } from 'lucide-react'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/atoms/Button'
import { Alert } from '@/components/atoms/Alert'
import { Checkbox } from '@/components/atoms/Checkbox'
import { Link } from '@/components/atoms/Link'
import { Select, SelectItem } from '@/components/atoms/Select'
import { AddToCalendar } from '@/components/molecules/AddToCalendar'
import { FormField, TextField } from '@/components/molecules/FormField'
import { INPUT_REFUSAL_KEYS } from '@/components/organisms/ReportIssueForm/refusal-copy'
import { ShareContent } from '@/components/molecules/ShareContent'
import api from '@/config/api'
import {
  type RegistrationErrorCode,
  RegistrationRefusedError,
  USER_SUBMISSION_VALUE_MAX,
} from '@/config/api/mutate'
import livePreview from '@/config/live-preview/protocol'
import { rewordedKey } from '@/config/reworded-keys'
import { classifyError } from '@/lib/report'
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
import { formatDate, formatLongDate, formatRelativeDate, regionalLocale } from '@/lib/time'
import { useViewerCountry } from '@/hooks/use-viewer-country'

const PRIVACY_POLICY_URL = 'https://wemeditate.com/privacy'

// Marks where the privacy link sits in the consent sentence: a private-use character, which no
// translation contains.
const LINK_SLOT = '\uE000'

/**
 * This is our copy for each **state** refusal SahajCloud can return (409 and
 * `code`, SahajCloud#601). The endpoint's own messages are English-only
 * prose. This is typed as a total Record over the synced union, so a
 * `pnpm types:cms` that adds or renames a code fails the build here,
 * instead of silently degrading to the generic error. Three of the four
 * reuse the display copy the panel already shows for the same state, so the
 * form and the panel cannot word it differently: ended and full name the
 * reworded keys `useEventDisplay` reads ("This class has ended"), and the
 * render resolves them through `rewordedKey` the same way.
 */
const STATE_MESSAGE_KEYS: Record<EventRegistrationErrorCode, TranslationKey> = {
  external_registration: 'event.display.registration_external',
  event_ended: 'event.display.class_ended',
  registration_closed: 'event.display.registration_closed',
  event_full: 'event.display.class_full',
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

/**
 * The sentence under the generic title, for a failure that names no refusal.
 *
 * A request that got no response at all — offline, SahajCloud unreachable, a rejected CORS
 * preflight — never reached the captcha check, so asking for the challenge again would send the
 * visitor round the same failure. Anything that did get a response may have spent the token, so
 * it keeps the "wait for the check, then register again" sentence.
 */
const unansweredKey = (error: unknown): TranslationKey => {
  const answered = typeof (error as { status?: unknown } | null)?.status === 'number'
  const kind = answered ? undefined : classifyError(error)

  if (kind === 'offline') return 'common.errors.offline'
  if (kind === 'server') return 'common.errors.server'

  return 'registration.form.captcha_retry'
}

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
   * Whether this event's region, an ancestor of it, or the atlas fallback offers a mailing list.
   * The opt-in box renders only when this is `true` — never where no list would receive the
   * subscription.
   */
  hasMailingList?: boolean
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
  hasMailingList = false,
  onSubmitted,
  initialSubmitted = false,
  initialRefusal,
}: RegistrationFormProps) {
  const [submitted, setSubmitted] = useState(initialSubmitted)
  const { t, i18n } = useTranslation()
  // The consent sentence, split where the privacy link goes. A translation without the slot still
  // reads whole, with the link after it.
  const consentText = t('registration.form.consent', { link: LINK_SLOT })
  const [consentBefore, consentAfter] = consentText.includes(LINK_SLOT)
    ? consentText.split(LINK_SLOT)
    : [`${consentText} `, '']
  const queryClient = useQueryClient()
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

  // This is the challenge for this submission. Only this form needs it, so a blocked challenge
  // shows here, with a retry, rather than stopping the whole widget.
  const {
    challengeRef,
    token,
    status: challengeStatus,
    reset: resetChallenge,
    retry: retryChallenge,
  } = useTurnstile()
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
    // A remount (the drawer crossing between sheet and side panel) restores what was typed. A
    // mistyped address comes back flagged on its box, as leaving the field had flagged it.
    if (defaultValues.email) void trigger('email')
    // Mount-only: the story's refusal and the restored draft never change.
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
  // not know — keeps the generic title, in the error colour, over a sentence
  // that says what to do next (`unansweredKey`).
  const refusal = mutation.error ?? initialRefusal
  const refusalMessage = refusalKey(refusal)
  const failureDescription = refusalMessage ? undefined : unansweredKey(refusal)
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
          <div
            ref={challengeRef}
            className={challengeStatus === 'blocked' ? 'hidden' : 'mt-4 empty:mt-0'}
          />

          {challengeStatus === 'blocked' && !isPreview && (
            <div className="mt-4 flex flex-col items-start gap-3">
              <Alert
                className="w-full"
                color="secondary"
                description={t('registration.form.captcha_blocked')}
                role="alert"
              />
              <Button variant="flat" onClick={retryChallenge}>
                {t('common.errors.retry')}
              </Button>
            </div>
          )}

          {/* A refusal is not a malfunction, so it states its reason on its
              own, without the "Something went wrong" framing or the
              endpoint's English message, and without the error colour. */}
          {showAlert && (
            <Alert
              color={refusalMessage ? 'secondary' : 'danger'}
              description={failureDescription && t(failureDescription)}
              role="alert"
              title={t(rewordedKey(i18n, refusalMessage ?? 'registration.form.error_title'))}
            />
          )}

          {/* Registering no longer doubles as consent to other mail: that is a separate box, off
              by default, and only where this class's region (or the atlas) has a mailing list to
              receive it. Pending a qualified GDPR check of the wording. */}
          {hasMailingList && (
            <Controller
              control={control}
              name="subscribe"
              render={({ field }) => (
                <Checkbox
                  appearance="checkbox"
                  checked={field.value === true}
                  id={field.name}
                  onCheckedChange={field.onChange}
                >
                  <span className="text-sm">{t('registration.form.subscribe')}</span>
                </Checkbox>
              )}
            />
          )}
          {/* Today's wording, which also consents to messages about similar classes (Anton,
              6 Nov), with "privacy policy" as a link inside the sentence. The sentence is one
              key and the link drops into its `%{link}` slot, so a translation can move it. The
              link keeps a 44px tap area without making its line taller. */}
          <p className="text-sm text-gray-11">
            {consentBefore}
            <Link
              isExternal
              className="touch-target relative font-medium text-primary-12 underline underline-offset-2"
              href={PRIVACY_POLICY_URL}
            >
              {t('registration.form.privacy_link')}
            </Link>
            {consentAfter}
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
        <div className="sticky bottom-[max(0px,calc(var(--sy-sheet-top,0px)_-_var(--sy-frame-h,0px)*0.03))] z-10 -mx-gutter flex flex-col gap-1.5 border-t border-divider bg-background px-gutter pt-3 pb-[max(8px,env(safe-area-inset-bottom))]">
          {/* No token means no registration the server would accept. So the
              button stays disabled until the challenge is solved — the
              same contract the report form has always had, including while
              the challenge is blocked and the alert above offers a retry. */}
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
              when empty, so Register does not move just as it becomes tappable. When the check
              failed to load, it must not ask the visitor to complete a check that isn't there. */}
          <p aria-live="polite" className="min-h-5 text-center text-sm text-gray-11">
            {isPreview || token
              ? ''
              : t(
                  challengeStatus === 'blocked'
                    ? 'registration.form.register_when_check_loads'
                    : checkIsSlow
                      ? 'registration.form.security_check'
                      : 'registration.form.checking',
                )}
          </p>
        </div>
      )}
    </form>
  )
}

/** The confirmation's way to pass the class on: the same share block as the class's Share panel. */
function InviteFriend({ children }: { children: ReactNode }) {
  const { t } = useTranslation()

  return (
    <section
      aria-labelledby="invite-friend"
      className="flex flex-col gap-3 border-t border-divider pt-4"
    >
      <h3 className="text-base font-medium" id="invite-friend">
        {t('registration.form.invite_friend')}
      </h3>
      {children}
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

// The label, control, and error shell is the shared `FormField` molecule, and the text fields are
// the shared `TextField`, as in the add-a-class form. So the required marker, the
// aria-describedby id convention, the field size and the error border are defined once.

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

  return (
    <div className="flex flex-col gap-4">
      {/* The form value is the ISO string. RegistrationSchema's z.coerce.date()
          turns it into a Date on submit, so the select stores the ISO string,
          and this casts across that string-to-Date coercion seam. */}
      <Controller
        control={control}
        defaultValue={upcomingDates[0]?.toISOString() as unknown as Date}
        name="startingAt"
        render={({ field }) => (
          <FormField
            error={errors.startingAt && t('registration.errors.starting_at')}
            htmlFor={field.name}
            label={t('registration.form.first_class')}
          >
            {/* A dropdown, so choosing never pushes the fields below it down. The next date is
                already chosen, and each option says how far off it is ("Next week", "In 2
                weeks"), so a later week is still one quick pick.

                `field.ref` is what makes a failed submit MOVE (issue #102): react-hook-form
                focuses the first invalid field, but only one it holds a ref for. */}
            {(control) => (
              <Select
                {...control}
                ref={field.ref}
                name={field.name}
                value={field.value as unknown as string}
                onBlur={field.onBlur}
                onValueChange={field.onChange}
              >
                {startingDates.map(({ value, label, text }) => (
                  <SelectItem key={value} textValue={text} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </Select>
            )}
          </FormField>
        )}
        rules={{ required: true }}
      />

      <TextField
        required
        autoComplete="name"
        error={errorCopy(errors.name, t, 'registration.errors.name')}
        id="name"
        label={t('registration.form.name')}
        maxLength={USER_SUBMISSION_VALUE_MAX}
        type="text"
        {...register('name', { required: true })}
      />

      <TextField
        required
        autoComplete="email"
        error={errorCopy(errors.email, t, 'registration.errors.email')}
        id="email"
        inputMode="email"
        label={t('registration.form.email')}
        type="email"
        // A typo in the address is worth saying as soon as they leave the field. An empty field is
        // not: that may just be someone looking around, and it waits for Register.
        {...register('email', {
          required: true,
          onBlur: (event) => {
            if (event.target.value) void trigger('email')
          },
        })}
      />

      {questions.map((question, index) => (
        <TextField
          key={index}
          multiline
          optional
          error={errorCopy(errors.questions?.[question], t)}
          id={`questions.${question}`}
          label={t(`registration.questions.${question}`)}
          maxLength={USER_SUBMISSION_VALUE_MAX}
          rows={2}
          {...register(`questions.${question}`)}
        />
      ))}
    </div>
  )
}

/** How long the security check may run quietly before the visitor is told it may need them. */
const CHECK_PATIENCE_MS = 4000

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

/** A starting date in the class's own zone, which is the clock its dates are listed in. */
const inClassZone = (date: Date, timeZone: string | undefined) =>
  DateTime.fromJSDate(date).setZone(timeZone ?? 'local')

/**
 * "Tuesday 10 November" (en-GB) or "Tuesday, November 10" (en-US) in the class's own zone, for
 * the confirmation line. The same regional locale as the date list above, so the two agree.
 */
const longDate = (date: Date, timeZone: string | undefined, locale: string) =>
  formatLongDate(inClassZone(date, timeZone), regionalLocale(locale))

/** One starting date: the ISO value, its rendered label, and the same words as plain text for
 *  the listbox's type-ahead. */
type DateOption = { value: string; label: ReactNode; text: string }

function dateOptions(
  dates: Date[],
  recurrenceType: RecurrenceType | null | undefined,
  timeZone: string | undefined,
  locale: string,
): DateOption[] {
  const unit = recurrenceType ? RELATIVE_UNIT[recurrenceType] : undefined
  const formatLocale = regionalLocale(locale)

  return dates.map((date) => {
    const at = inClassZone(date, timeZone)
    const day = formatDate(at, formatLocale)
    const relative = formatRelativeDate(at, formatLocale, unit)

    return {
      value: date.toISOString(),
      label: (
        <>
          {day}
          <span className="text-gray-11">
            {' · '}
            {relative}
          </span>
        </>
      ),
      text: `${day} · ${relative}`,
    }
  })
}
