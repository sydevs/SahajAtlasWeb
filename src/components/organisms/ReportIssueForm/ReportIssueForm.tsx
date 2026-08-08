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
import { ContactRefusedError } from '@/config/api/mutate'
import { useTurnstile } from '@/hooks/use-turnstile'
import { REPORT_MESSAGE_MAX, REPORT_MESSAGE_MIN, type Report, ReportSchema } from '@/types/report'

/**
 * Where a viewer is directed when the form can't deliver — the captcha never loaded, or
 * the POST failed. The same address the endpoint mails, so the report reaches the same
 * inbox either way.
 */
const CONTACT_EMAIL = 'contact@sydevelopers.com'

export type ReportIssueFormProps = {
  /**
   * The auto-attached context, assembled by the host (ReportIssueModal) rather than
   * here — so this stays presentational and renders in a story or the node test lane
   * without a Router, a query client, or a live locale.
   */
  context: ReportContext
  /** Dismiss the enclosing modal — wired to Cancel and to the thank-you screen. */
  onClose: () => void
  /** Story-only: start on the thank-you screen rather than the live form. */
  initialSubmitted?: boolean
  /**
   * Story-only: render the send-failed state without a real failed request. Shows the
   * generic failure; the captcha-rejection wording is a live-only path.
   */
  initialFailed?: boolean
  /** Story-only: render the degraded state as if Turnstile were blocked. */
  captchaUnavailable?: boolean
  /** Pre-fill the fields. Seeded values are validated on mount, so their state shows. */
  initialValues?: Partial<Report>
}

/**
 * The report-issue form (issues #79/#103): an optional reply address, the message, and a
 * Turnstile challenge, over the auto-attached `context` the viewer never types.
 *
 * Submit POSTs to SahajCloud's shared `/api/contact-admin` (sydevs/SahajCloud#602), which
 * verifies the token and emails the team. **The thank-you screen is derived from the
 * mutation's own success and nothing else** — it used to be set beside a `window.alert`,
 * so every report "sent" successfully and none of them went anywhere. This form is
 * reached BECAUSE something already failed, often the network, so its failure state has
 * to be the honest one.
 *
 * The modal unmounts its content on close, so this remounts fresh on each reopen — and
 * the captcha is torn down with it, so a reopened form always gets a new challenge.
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
    containerRef,
    token,
    status,
    reset: resetCaptcha,
  } = useTurnstile({
    disabled: captchaUnavailable,
  })

  const mutation = useMutation({
    mutationFn: api.contactAdmin,
    // A Turnstile token is single-use and the endpoint redeems it during verification —
    // BEFORE it tries to send the email. So after a 502 (mail provider down) the token is
    // already spent, and re-submitting it would be refused as a replay for as long as the
    // form stays open. Reset on every failure, not just the 403: the one case where the
    // token survives is a request that never reached the server, where a fresh challenge
    // costs nothing.
    onError: resetCaptcha,
  })

  // Nothing else may set this. `mutation.isSuccess` means a resolved, zod-parsed
  // `{ ok: true }` — the endpoint answers 502 rather than a false 200 when the mail
  // itself fails, so a resolved promise really does mean the message was delivered.
  const submitted = initialSubmitted || mutation.isSuccess

  const {
    register,
    handleSubmit,
    trigger,
    formState: { errors, isValid },
  } = useForm<Report>({
    resolver: zodResolver(ReportSchema),
    // Validate as they type: the submit control stays disabled until the message is
    // long enough AND the email (if given) parses, so `isValid` has to track edits
    // rather than only settling on the first submit attempt.
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
  // Both bounds get their own sentence: one "at least 10 characters" string shown for a
  // too-LONG message would tell the user the opposite of what's wrong.
  const messageError =
    errors.message?.type === 'too_big'
      ? t('report.errors.message_max', { max: REPORT_MESSAGE_MAX })
      : t('report.errors.message', { min: REPORT_MESSAGE_MIN })

  // A captcha rejection is the one failure the viewer can act on directly, and the
  // challenge has already been reset underneath them — so say to wait and re-send,
  // rather than the generic "try again or email us". Every other failure (offline, 5xx,
  // a 502 from the mailer) gets the generic sentence, which carries the address that
  // still works. The thrown message never reaches the screen; it is developer text.
  const failureMessage =
    mutation.error instanceof ContactRefusedError && mutation.error.code === 'captcha_failed'
      ? t('report.errors.captcha')
      : t('report.errors.send_failed', { email: CONTACT_EMAIL })

  const failed = initialFailed || mutation.isError

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={handleSubmit((values) => {
        // No token means the challenge isn't solved (or was just reset after a failed
        // send). The control is disabled in that state; this is the belt to its braces.
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
          {/* `announceError={false}` on both fields, because this form is the shape
              FormField's default is wrong for (issue #102): it validates on every
              keystroke (`mode: 'onChange'` above) and it gates Send on `isValid`, so
              there is no failed submit to announce — only an assertive interruption
              on the first character of a message or an email address. The errors are
              still wired to each control through `aria-describedby`, so a reader
              standing on the field is told what is wrong with it. */}
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
          <div ref={containerRef} />

          {blocked && (
            <Alert align="start" color="secondary" description={t('report.blocked')} role="alert" />
          )}

          {/* A failed submit is the one thing here worth interrupting a screen reader
              for — unlike the field errors above (`announceError={false}`), which fire
              per keystroke on a form that gates its own submit. The typed message is
              still in the fields behind this, so the retry costs nothing to compose. */}
          {failed && (
            <Alert align="start" color="danger" description={failureMessage} role="alert" />
          )}
        </div>
      </ModalBody>

      <ModalFooter>
        <Button variant="flat" onClick={onClose}>
          {t('report.cancel')}
        </Button>
        {blocked ? (
          // No captcha means no token, so the form can never be sent. Offer the route
          // that still works instead of a button that would only ever be disabled.
          <Button color="primary" href={`mailto:${CONTACT_EMAIL}`} variant="flat">
            {CONTACT_EMAIL}
          </Button>
        ) : (
          <Button
            color="primary"
            disabled={!isValid || !token}
            isLoading={mutation.isPending}
            type="submit"
            variant="flat"
          >
            {t('report.submit')}
          </Button>
        )}
      </ModalFooter>
    </form>
  )
}
