import type { ReportContext, ReportPayload } from '@/lib/report'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'

import { Alert } from '@/components/atoms/Alert'
import { Button } from '@/components/atoms/Button'
import { Input } from '@/components/atoms/Input'
import { ModalBody, ModalFooter } from '@/components/atoms/Modal'
import { Textarea } from '@/components/atoms/Textarea'
import { FormField, fieldDescribedBy } from '@/components/molecules/FormField'
import { useTurnstile } from '@/hooks/use-turnstile'
import { REPORT_MESSAGE_MAX, REPORT_MESSAGE_MIN, type Report, ReportSchema } from '@/types/report'

/** Where a viewer is directed when the captcha can't load and the form can't be sent. */
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
  /** Story-only: render the degraded state as if Turnstile were blocked. */
  captchaUnavailable?: boolean
  /** Pre-fill the fields. Seeded values are validated on mount, so their state shows. */
  initialValues?: Partial<Report>
}

/**
 * The report-issue form (issue #79): an optional reply address, the message, and a
 * Turnstile challenge, over the auto-attached `context` the viewer never types.
 *
 * Submit does not reach the network yet — SahajCloud's shared `POST /api/contact-admin`
 * lands in sydevs/SahajCloud#602 and is wired up in #80; until then it alerts the exact
 * payload that call will carry, so the follow-up only has to swap in the mutation.
 *
 * The modal unmounts its content on close, so this remounts fresh on each reopen — and
 * the captcha is torn down with it, so a reopened form always gets a new challenge.
 */
export function ReportIssueForm({
  context,
  onClose,
  initialSubmitted = false,
  captchaUnavailable = false,
  initialValues,
}: ReportIssueFormProps) {
  const { t } = useTranslation('common')
  const [submitted, setSubmitted] = useState(initialSubmitted)
  const { containerRef, token, status } = useTurnstile({ disabled: captchaUnavailable })

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

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={handleSubmit((values) => {
        if (!token) return

        const payload: ReportPayload = {
          // A blank optional input registers as '' — omit it rather than sending an
          // empty Reply-To.
          email: values.email || undefined,
          message: values.message,
          turnstileToken: token,
          context,
        }

        // TODO(#80): swap this for the createReport mutation once SahajCloud's shared
        // POST /api/contact-admin lands (sydevs/SahajCloud#602).
        window.alert(JSON.stringify(payload, null, 2))
        setSubmitted(true)
      })}
    >
      <ModalBody>
        <div className="flex flex-col gap-4 py-2">
          <FormField
            required
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
          <Button color="primary" disabled={!isValid || !token} type="submit" variant="flat">
            {t('report.submit')}
          </Button>
        )}
      </ModalFooter>
    </form>
  )
}
