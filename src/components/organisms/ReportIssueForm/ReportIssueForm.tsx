import type { UserMessageErrorCode } from '@/config/api/mutate'
import type { ReportContext, ReportPayload } from '@/lib/report'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { Alert } from '@/components/atoms/Alert'
import { Button } from '@/components/atoms/Button'
import { Input } from '@/components/atoms/Input'
import { ModalBody, ModalFooter } from '@/components/atoms/Modal'
import { Textarea } from '@/components/atoms/Textarea'
import { FormField, fieldDescribedBy } from '@/components/molecules/FormField'
import api from '@/config/api'
import { UserMessageRefusedError } from '@/config/api/mutate'
import { useTurnstile } from '@/hooks/use-turnstile'
import { REPORT_MESSAGE_MAX, REPORT_MESSAGE_MIN, type Report, ReportSchema } from '@/types/report'

/**
 * This is our copy for each refusal the intake can name, keyed by its
 * machine-readable code. It is a total `Record` over the union — exactly as
 * `RegistrationForm` does. So ADDING a code to `UserMessageErrorCode` fails
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
const REFUSAL_MESSAGE_KEYS: Record<UserMessageErrorCode, string> = {
  captcha_failed: 'report.errors.captcha',
  captcha_unavailable: 'report.errors.send_failed',
  invalid_email: 'report.errors.email',
  disposable_email: 'report.errors.disposable_email',
  urls_not_allowed: 'report.errors.urls_not_allowed',
}

export type ReportIssueFormProps = {
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
  /** Pre-fill the fields. Seeded values are validated on mount, so their state shows. */
  initialValues?: Partial<Report>
}

/**
 * This is the report-issue form (issues #79 and #103): an optional reply
 * address, the message, and a Turnstile challenge, over the auto-attached
 * `context` the viewer never types.
 *
 * Submit POSTs to SahajCloud's shared `/api/user-messages`
 * (sydevs/SahajCloud#632), which verifies the token, screens for spam, and
 * hands the message to a delivery job. **The thank-you screen is derived
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
  context,
  onClose,
  initialSubmitted = false,
  initialFailed = false,
  captchaUnavailable = false,
  initialValues,
}: ReportIssueFormProps) {
  const { t } = useTranslation('common')
  const {
    challengeRef,
    token,
    status,
    reset: resetCaptcha,
  } = useTurnstile({
    disabled: captchaUnavailable,
  })

  const mutation = useMutation({
    mutationFn: api.sendUserMessage,
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
    register,
    handleSubmit,
    trigger,
    formState: { errors, isValid },
  } = useForm<Report>({
    resolver: zodResolver(ReportSchema),
    // This validates as they type. The submit control stays disabled until
    // the message is long enough AND the email (if given) parses. So
    // `isValid` has to track edits, rather than only settling on the first
    // submit attempt.
    mode: 'onChange',
    defaultValues: { email: '', message: '', ...initialValues },
  })

  // Pre-filled values are shown already validated — an empty form still starts clean.
  useEffect(() => {
    if (initialValues) void trigger()
    // Mount-only: re-validating on every `initialValues` identity change would fight
    // the user's own edits.
  }, [])

  if (submitted) {
    return (
      <>
        <ModalBody>
          <p className="py-2 text-sm">{t('report.sent')}</p>
        </ModalBody>
        <ModalFooter>
          <Button color="primary" variant="flat" onClick={onClose}>
            {t('close')}
          </Button>
        </ModalFooter>
      </>
    )
  }

  const blocked = status === 'blocked'
  // Both bounds get their own sentence. One "at least 10 characters" string
  // shown for a too-LONG message would tell the user the opposite of what
  // is wrong.
  const messageError =
    errors.message?.type === 'too_big'
      ? t('report.errors.message_max', { max: REPORT_MESSAGE_MAX })
      : t('report.errors.message', { min: REPORT_MESSAGE_MIN })

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
    mutation.error instanceof UserMessageRefusedError &&
    Object.prototype.hasOwnProperty.call(REFUSAL_MESSAGE_KEYS, mutation.error.code)
      ? REFUSAL_MESSAGE_KEYS[mutation.error.code]
      : undefined

  const failureMessage = refusalKey ? t(refusalKey) : t('report.errors.send_failed')

  const failed = initialFailed || mutation.isError

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={handleSubmit((values) => {
        // No token means the challenge is not solved, or it was just reset
        // after a failed send. The control is disabled in that state. This
        // check is an extra safeguard.
        if (!token || mutation.isPending) return

        const payload: ReportPayload = {
          // A blank optional input registers as '' — omit it rather than sending an
          // empty Reply-To.
          email: values.email || undefined,
          message: values.message,
          turnstileToken: token,
          context,
        }

        mutation.mutate(payload)
      })}
    >
      <ModalBody>
        <div className="flex flex-col gap-4 py-2">
          {/* `announceError={false}` applies to both fields, because this form is
              the shape FormField's default is wrong for (issue #102). It
              validates on every keystroke (`mode: 'onChange'` above), and
              it gates Send on `isValid`. So there is no failed submit to
              announce — only an assertive interruption on the first
              character of a message or an email address. The errors stay
              wired to each control through `aria-describedby`, so a
              reader standing on the field is told what is wrong with it. */}
          <FormField
            required
            announceError={false}
            error={errors.message && messageError}
            htmlFor="report-message"
            label={t('report.message_label')}
          >
            <Textarea
              aria-describedby={fieldDescribedBy({
                name: 'report-message',
                error: Boolean(errors.message),
              })}
              aria-invalid={errors.message ? true : undefined}
              aria-required="true"
              id="report-message"
              isInvalid={Boolean(errors.message)}
              // A hard stop at the schema's ceiling. Without it, pasting a long stack
              // trace — the very report this exists for — just disables submit.
              maxLength={REPORT_MESSAGE_MAX}
              placeholder={t('report.message_placeholder')}
              rows={5}
              {...register('message')}
            />
          </FormField>

          <FormField
            announceError={false}
            error={errors.email && t('report.errors.email')}
            help={t('report.email_help')}
            htmlFor="report-email"
            label={t('report.email_label')}
          >
            <Input
              // Describe by the help line as well as any error, so the "optional, and we
              // can only reply if you fill it in" caveat is announced, not just seen.
              aria-describedby={fieldDescribedBy({
                name: 'report-email',
                help: true,
                error: Boolean(errors.email),
              })}
              aria-invalid={errors.email ? true : undefined}
              id="report-email"
              isInvalid={Boolean(errors.email)}
              placeholder={t('report.email_placeholder')}
              type="email"
              {...register('email')}
            />
          </FormField>

          {/* Kept mounted even when blocked: the hook renders the challenge into it
              once Turnstile becomes available, and an empty div costs nothing. */}
          <div ref={challengeRef} />

          {blocked && (
            <Alert align="start" color="secondary" description={t('report.blocked')} role="alert" />
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
          {t('report.cancel')}
        </Button>
        {/* `!token` disables: a solved challenge is what makes the submit sendable. */}
        <Button
          color="primary"
          disabled={!isValid || !token}
          isLoading={mutation.isPending}
          type="submit"
          variant="flat"
        >
          {t('report.submit')}
        </Button>
      </ModalFooter>
    </form>
  )
}
