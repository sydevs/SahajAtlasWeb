import type { TranslationKey } from '@/types/i18next'
import type { UserSubmissionErrorCode } from '@/config/api/mutate'
import type { ReportContext } from '@/lib/report'
import type { ReportValues } from '@/lib/report-form'
import type { ReportForm, ReportFormField } from '@/types/report'
import type { TFunction } from 'i18next'
import type { ReactElement } from 'react'
import type { Control, ControllerRenderProps, FieldError, UseFormRegister } from 'react-hook-form'

import { memo, useEffect, useMemo } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { Alert } from '@/components/atoms/Alert'
import { Button } from '@/components/atoms/Button'
import { Checkbox } from '@/components/atoms/Checkbox'
import { Input } from '@/components/atoms/Input'
import { ModalBody, ModalFooter } from '@/components/atoms/Modal'
import { Select, SelectItem } from '@/components/atoms/Select'
import { Textarea } from '@/components/atoms/Textarea'
import { FormField, fieldDescribedBy } from '@/components/molecules/FormField'
import api from '@/config/api'
import { UserSubmissionError, USER_SUBMISSION_VALUE_MAX } from '@/config/api/mutate'
import { useTurnstile } from '@/hooks/use-turnstile'
import { lexicalToText } from '@/lib/shape/lexical'
import {
  fieldKey,
  renderableFields,
  reportAnswers,
  reportDefaultValues,
  reportSenderEmail,
  reportValuesSchema,
} from '@/lib/report-form'
import { REPORT_EMAIL_MAX, REPORT_MESSAGE_MAX, REPORT_MESSAGE_MIN } from '@/types/report'

/**
 * This is our copy for each refusal the intake can name, keyed by its
 * machine-readable code. It is a total `Record` over the union — exactly as
 * `RegistrationForm` does. So ADDING a code to `UserSubmissionErrorCode` fails
 * the build here, instead of silently routing the new case to the generic
 * "try again" sentence.
 *
 * Two of these five are actionable by the sender, and two are not. That is
 * what decides the copy, rather than the HTTP status:
 *
 * - `captcha_failed` — the token was forged, expired, or already redeemed.
 *   The challenge has been reset under the viewer by then, so the copy
 *   tells them to wait for it and re-send, rather than offering the email
 *   escape.
 * - `captcha_unavailable` — Cloudflare is unreachable on OUR side. There is
 *   nothing the sender can fix, and re-sending is the only move, so this
 *   takes the generic sentence.
 * - `invalid_email` and `disposable_email` — the address. Both name the
 *   field, because the sender can change it, or clear it, since the
 *   address is optional.
 * - `urls_not_allowed` — a link in the message body. This is actionable,
 *   and worth saying precisely. The generic "wait for the security check"
 *   is actively misleading here, since waiting will never help.
 */
const REFUSAL_MESSAGE_KEYS: Record<UserSubmissionErrorCode, TranslationKey> = {
  captcha_failed: 'common.report_errors.captcha',
  captcha_unavailable: 'common.report_errors.send_failed',
  invalid_email: 'common.report_errors.email',
  disposable_email: 'common.report_errors.disposable_email',
  urls_not_allowed: 'common.report_errors.urls_not_allowed',
}

export type ReportIssueFormProps = {
  /**
   * The authored form this renders: the operator's own questions, from the
   * `contact` form named on `sy-atlas-config.reportIssueForm` (issue #216).
   * The host fetches it, so this component stays presentational.
   */
  form: ReportForm
  /**
   * This is the auto-attached context. The host (ReportIssueModal) assembles
   * it, rather than this component, so this stays presentational. It
   * renders in a story or the node test lane without a Router, a query
   * client, or a live locale.
   */
  context: ReportContext
  /** Dismiss the enclosing modal — wired to Cancel and to the thank-you screen. */
  onClose: () => void
  /** Story-only: start on the thank-you screen rather than the live form. */
  initialSubmitted?: boolean
  /**
   * Story-only: render the send-failed state without a real failed request.
   * This shows the generic failure. The captcha-rejection wording is a
   * live-only path.
   */
  initialFailed?: boolean
  /** Story-only: render the degraded state as if Turnstile were blocked. */
  captchaUnavailable?: boolean
  /**
   * Pre-fill the fields, keyed by `fieldKey` (the field's position), not by
   * the authored name. Seeded values are validated on mount, so their state shows.
   */
  initialValues?: ReportValues
}

const controlId = (index: number) => `report-field-${index}`

// The three text blocks the browser can help with. Everything else the `default` arm renders is
// free text, which is what `country` and `state` are here too.
const inputType = (blockType: ReportFormField['blockType']) =>
  blockType === 'email' ? 'email' : blockType === 'number' ? 'number' : 'text'

/**
 * Our own words for the two blocks this form has words for.
 *
 * The form-builder's `label` is optional, so a field authored without one would otherwise show
 * its machine name. Where the operator authored nothing, the widget supplies the whole set —
 * label, placeholder, and for an optional address the reply caveat. Where they authored a label,
 * the field is theirs and none of this applies: a placeholder of ours under a question of theirs
 * would describe a different question.
 */
type FieldCopy = { label: TranslationKey; placeholder: TranslationKey; help?: TranslationKey }

const FIELD_COPY: Partial<Record<ReportFormField['blockType'], FieldCopy>> = {
  email: {
    label: 'common.report.email_label',
    placeholder: 'common.report.email_placeholder',
    help: 'common.report.email_help',
  },
  textarea: {
    label: 'common.report.message_label',
    placeholder: 'common.report.message_placeholder',
  },
}

const ownCopy = (field: ReportFormField) =>
  field.blockType === 'email' || field.blockType === 'textarea'
    ? FIELD_COPY[field.blockType]
    : undefined

/**
 * The sentence under a failed field, where one exists.
 *
 * Only the two blocks with copy of their own get one. Everything else is a required field the
 * viewer has not filled in yet, which keeps Send disabled and is already marked on the label —
 * inventing English for it here would go untranslated, since every string the widget shows is
 * CMS-owned.
 */
const errorCopy = (field: ReportFormField, error: FieldError | undefined, t: TFunction) => {
  if (!error) return undefined

  if (field.blockType === 'email') return t('common.report_errors.email')

  if (field.blockType === 'textarea')
    return error.type === 'too_big'
      ? t('common.report_errors.message_max', { max: REPORT_MESSAGE_MAX })
      : t('common.report_errors.message', { min: REPORT_MESSAGE_MIN })

  return undefined
}

type AuthoredFieldProps = {
  field: ReportFormField
  index: number
  control: Control<ReportValues>
  register: UseFormRegister<ReportValues>
  error: FieldError | undefined
}

/**
 * One authored block.
 *
 * `select` and `checkbox` go through `Controller` because neither is a native input RHF can
 * `register`. Everything else is a text control, `country` and `state` included: the widget has
 * no authored option list for either, and the answer travels as a string whichever control
 * collects it. The control is a `switch` over the union rather than a chain of guards, so a
 * block type added to the schema cannot render a labelled field with nothing inside it.
 *
 * Memoized because the form validates on every keystroke. Without it, each keystroke re-renders
 * every field and re-walks each prose block's Lexical tree.
 */
const AuthoredField = memo(function AuthoredField({
  field,
  index,
  control,
  register,
  error,
}: AuthoredFieldProps) {
  const { t } = useTranslation()

  if (field.blockType === 'message') {
    // Authored prose, rendered as TEXT. The serializer's HTML form would need the DOMPurify pass
    // that goes with it (`EventDetails/sanitize.ts`), and this form sits in the eager graph.
    const prose = lexicalToText(field.message)

    return prose ? <p className="text-sm text-gray-11">{prose}</p> : null
  }

  const id = controlId(index)
  const key = fieldKey(index)
  const copy = ownCopy(field)
  // An authored label means the question is the operator's, so our copy stands down with it.
  const ours = field.label ? undefined : copy
  const label = field.label || (copy ? t(copy.label) : field.name)
  const help = ours?.help && !field.required ? t(ours.help) : undefined
  const describedBy = fieldDescribedBy({ name: id, help: Boolean(help), error: Boolean(error) })

  const typed = {
    'aria-describedby': describedBy,
    'aria-invalid': error ? (true as const) : undefined,
    'aria-required': field.required ? ('true' as const) : undefined,
    id,
    isInvalid: Boolean(error),
    placeholder: ours ? t(ours.placeholder) : undefined,
  }

  const bindings = (
    render: (bound: ControllerRenderProps<ReportValues, string>) => ReactElement,
  ) => <Controller control={control} name={key} render={({ field: bound }) => render(bound)} />

  const authoredControl = () => {
    switch (field.blockType) {
      case 'textarea':
        return (
          <Textarea
            {...typed}
            // A hard stop at the schema's ceiling. Without it, pasting a long stack
            // trace — the very report this exists for — just disables submit.
            maxLength={REPORT_MESSAGE_MAX}
            rows={5}
            {...register(key)}
          />
        )
      case 'select':
        return bindings((bound) => (
          <Select
            aria-describedby={describedBy}
            aria-label={label}
            isInvalid={Boolean(error)}
            name={bound.name}
            placeholder={field.placeholder ?? undefined}
            value={typeof bound.value === 'string' ? bound.value : ''}
            onBlur={bound.onBlur}
            onValueChange={bound.onChange}
          >
            {(field.options ?? []).map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </Select>
        ))
      case 'checkbox':
        return bindings((bound) => (
          <Checkbox
            appearance="checkbox"
            aria-describedby={describedBy}
            checked={bound.value === true}
            id={id}
            isInvalid={Boolean(error)}
            onCheckedChange={bound.onChange}
          >
            {label}
          </Checkbox>
        ))
      default:
        return (
          <Input
            {...typed}
            // One over-long value refuses the whole submission with nothing pointing at the field
            // that caused it, so the control stops the viewer at the bound instead.
            maxLength={field.blockType === 'email' ? REPORT_EMAIL_MAX : USER_SUBMISSION_VALUE_MAX}
            type={inputType(field.blockType)}
            {...register(key)}
          />
        )
    }
  }

  return (
    <FormField
      announceError={false}
      error={errorCopy(field, error, t)}
      help={help}
      htmlFor={field.blockType === 'checkbox' ? undefined : id}
      label={label}
      required={Boolean(field.required)}
    >
      {authoredControl()}
    </FormField>
  )
})

/**
 * This is the report-issue form (issues #79, #103 and #216): the questions an
 * operator authored on SahajCloud, over the auto-attached `context` the viewer
 * never types, behind a Turnstile challenge.
 *
 * Submit POSTs a `contact` row NAMING that form to SahajCloud's shared
 * `/api/user-submissions` (sydevs/SahajCloud#695, #813), which verifies the
 * token, screens for spam, and hands the message to a delivery job that
 * resolves the form's own recipient. **The thank-you screen is derived
 * from the mutation's own success and nothing else.** It used to be set
 * beside a `window.alert`, so every report "sent" successfully and none of
 * them went anywhere. This form is reached BECAUSE something already
 * failed, often the network, so its failure state has to be the honest one.
 *
 * The modal unmounts its content on close, so this remounts fresh on each
 * reopen. The captcha is also removed with it, so a reopened form always
 * gets a new challenge.
 */
export function ReportIssueForm({
  form,
  context,
  onClose,
  initialSubmitted = false,
  initialFailed = false,
  captchaUnavailable = false,
  initialValues,
}: ReportIssueFormProps) {
  const { t } = useTranslation()
  const {
    challengeRef,
    token,
    status,
    reset: resetCaptcha,
  } = useTurnstile({
    disabled: captchaUnavailable,
  })

  // All three are memoized because this form validates on every keystroke (`mode: 'onChange'`
  // below), and react-hook-form reads the defaults once, at mount. Rebuilding a zod schema and
  // a resolver closure per character is pure waste.
  const fields = useMemo(() => renderableFields(form), [form])
  const schema = useMemo(() => reportValuesSchema(fields), [fields])
  const resolver = useMemo(() => zodResolver(schema), [schema])
  const defaultValues = useMemo(
    () => ({ ...reportDefaultValues(fields), ...initialValues }),
    // Mount-only in effect: RHF reads this once. `initialValues` is story-only.
    [fields],
  )

  const mutation = useMutation({
    mutationFn: api.sendReport,
    /**
     * React Query's default `networkMode: 'online'` **pauses** a mutation
     * fired while the browser reports itself offline: no request, no
     * throw, no `onError`. It sits `isPending` until connectivity returns.
     *
     * That default is wrong for this form specifically, in both
     * directions.
     *
     * Forward: the viewer gets a spinner that never resolves, on the one
     * screen in the widget that exists BECAUSE something already failed —
     * often the network. So the honest failure state this ticket is about
     * would be the one state it could never reach.
     *
     * Backward: a paused mutation outlives the modal. The query client
     * resumes it on the `online` event. So a viewer who gave up, reopened
     * the form, and sent a second report would have both delivered.
     *
     * `'always'` makes the fetch attempt and fail like any other error,
     * which is what the failure copy already describes.
     */
    networkMode: 'always',
    // A Turnstile token is single-use, and the write-guard redeems it
    // during verification — BEFORE the collection accepts the row. So
    // after any later failure, the token is already spent, and
    // re-submitting it would be refused as a replay for as long as the
    // form stays open. This resets on every failure, not just the 403. The
    // one case where the token survives is a request that never reached
    // the server, where a fresh challenge costs nothing.
    onError: resetCaptcha,
  })

  // Nothing else may set this. `mutation.isSuccess` means a resolved,
  // zod-parsed create envelope — the message is stored and queued.
  //
  // ⚠ It no longer means DELIVERED, and that is a real narrowing (#171).
  // The old endpoint sent the email inline and answered 502 rather than a
  // false 200, so a resolved promise meant the team had it. Delivery is
  // now a background job minutes later. A send that fails surfaces to
  // SahajCloud admins as a `failed` row — the sender cannot be told. So
  // the thank-you copy promises receipt, not arrival.
  const submitted = initialSubmitted || mutation.isSuccess

  const {
    control,
    register,
    handleSubmit,
    trigger,
    formState: { errors, isValid },
  } = useForm<ReportValues>({
    resolver,
    // This validates as they type. The submit control stays disabled until
    // every authored field answers its own rule. So `isValid` has to track
    // edits, rather than only settling on the first submit attempt.
    mode: 'onChange',
    defaultValues,
  })

  // Pre-filled values are shown already validated — an empty form still starts clean.
  useEffect(() => {
    if (initialValues) void trigger()
    // Mount-only: re-validating on every `initialValues` identity change would fight
    // the user's own edits.
  }, [])

  if (submitted) {
    // The operator's own confirmation copy, when they authored one. Ours is the fallback, and it
    // deliberately promises receipt rather than arrival (#171) — delivery is a later job.
    const confirmation =
      form.confirmationType === 'message' ? lexicalToText(form.confirmationMessage) : ''

    return (
      <>
        <ModalBody>
          <p className="py-2 text-sm">{confirmation || t('common.report.sent')}</p>
        </ModalBody>
        <ModalFooter>
          <Button color="primary" variant="flat" onClick={onClose}>
            {t('common.chrome.close')}
          </Button>
        </ModalFooter>
      </>
    )
  }

  const blocked = status === 'blocked'

  // A named refusal gets its own sentence. Everything else — offline, 5xx,
  // a 502 from the mailer — gets the generic one. The thrown message never
  // reaches the screen. It is developer text, and it travels in the
  // report. This uses `hasOwnProperty`, not a bare index: `code` is a cast
  // over a `z.string()`, so at runtime it is whatever the response body
  // said. A bare lookup walks the prototype chain, and a code of
  // `constructor` or `toString` would hand `t()` a truthy non-string in
  // place of the failure sentence. `isErrorKind` in lib/report.ts uses the
  // same spelling.
  const refusalKey =
    mutation.error instanceof UserSubmissionError &&
    Object.prototype.hasOwnProperty.call(REFUSAL_MESSAGE_KEYS, mutation.error.code)
      ? REFUSAL_MESSAGE_KEYS[mutation.error.code]
      : undefined

  const failureMessage = refusalKey ? t(refusalKey) : t('common.report_errors.send_failed')

  const failed = initialFailed || mutation.isError

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={handleSubmit((values) => {
        // No token means the challenge is not solved, or it was just reset
        // after a failed send. The control is disabled in that state. This
        // check is an extra safeguard.
        if (!token || mutation.isPending) return

        mutation.mutate({
          form: form.id,
          answers: reportAnswers(fields, values),
          senderEmail: reportSenderEmail(fields, values),
          turnstileToken: token,
          context,
        })
      })}
    >
      <ModalBody>
        <div className="flex flex-col gap-4 py-2">
          {/* `announceError={false}` on every field, because this form is
              the shape FormField's default is wrong for (issue #102). It
              validates on every keystroke (`mode: 'onChange'` above), and
              it gates Send on `isValid`. So there is no failed submit to
              announce — only an assertive interruption on the first
              character typed. The errors stay wired to each control through
              `aria-describedby`, so a reader standing on the field is told
              what is wrong with it. */}
          {fields.map((field, index) => (
            <AuthoredField
              key={index}
              control={control}
              error={errors[fieldKey(index)] as FieldError | undefined}
              field={field}
              index={index}
              register={register}
            />
          ))}

          {/* Kept mounted even when blocked: the hook renders the challenge into it
              once Turnstile becomes available, and an empty div costs nothing. */}
          <div ref={challengeRef} />

          {blocked && (
            <Alert
              align="start"
              color="secondary"
              description={t('common.report.blocked')}
              role="alert"
            />
          )}

          {/* A failed submit is the one thing here worth interrupting a screen
              reader for. This is unlike the field errors above
              (`announceError={false}`), which fire per keystroke on a
              form that gates its own submit. The typed message stays in
              the fields behind this, so the retry costs nothing to
              compose. */}
          {failed && (
            <Alert align="start" color="danger" description={failureMessage} role="alert" />
          )}
        </div>
      </ModalBody>

      <ModalFooter>
        {/* This disables mid-flight, as RegistrationForm does. Closing here
            unmounts the form while the POST continues, so the viewer
            would never learn whether the report they just sent arrived. */}
        <Button disabled={mutation.isPending} variant="flat" onClick={onClose}>
          {t('common.chrome.cancel')}
        </Button>
        {/* `!token` disables: a solved challenge is what makes the submit sendable. */}
        <Button
          color="primary"
          disabled={!isValid || !token}
          isLoading={mutation.isPending}
          type="submit"
          variant="flat"
        >
          {form.submitButtonLabel || t('common.report.submit')}
        </Button>
      </ModalFooter>
    </form>
  )
}
