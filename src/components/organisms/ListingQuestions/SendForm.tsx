import type { TranslationKey } from '@/types/i18next'
import type { UserSubmissionErrorCode } from '@/config/api/mutate'
import type { ReportContext } from '@/lib/report'
import type { BuiltProposal, ListingDraft, ListingSender, ListingStep } from '@/lib/proposal'

import { useLayoutEffect, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { Alert } from '@/components/atoms/Alert'
import { Button } from '@/components/atoms/Button'
import { Input } from '@/components/atoms/Input'
import { Textarea } from '@/components/atoms/Textarea'
import { FormField, fieldDescribedBy } from '@/components/molecules/FormField'
import proposalApi from '@/config/api/proposal'
import { refusalCopyKey, userSubmissionValueMax } from '@/config/api/mutate'
import { useTurnstile } from '@/hooks/use-turnstile'
import { buildProposal, firstInvalidStep, isEmail } from '@/lib/proposal'

/** The copy for each refusal the proposal intake can return. */
const REFUSAL_MESSAGE_KEYS: Record<UserSubmissionErrorCode, TranslationKey> = {
  captcha_failed: 'submit.errors.captcha',
  captcha_unavailable: 'submit.errors.send_failed',
  invalid_email: 'submit.errors.email',
  disposable_email: 'submit.errors.disposable_email',
  urls_not_allowed: 'submit.errors.urls_not_allowed',
  content_unscannable: 'submit.errors.send_failed',
}

/** The form's id, so the sheet footer's Send button can submit it from outside. */
export const SEND_FORM_ID = 'listing-send'

/** What the footer's Send button needs to know about the form above it. */
export type SendState = { ready: boolean; pending: boolean }

export type SendFormProps = {
  draft: ListingDraft
  correction?: { eventId: number; baseDraft: ListingDraft }
  sender: ListingSender
  onSender: (patch: Partial<ListingSender>) => void
  context: ReportContext
  /** Prepended to the note on send — the correction's "reported as no longer running". */
  notePrefix?: string
  /** Shown open, rather than behind "Add a note": a correction's note is often the point. */
  noteOpen?: boolean
  onInvalid: (step: ListingStep) => void
  onSent: () => void
  onState: (state: SendState) => void
  initialRefusal?: UserSubmissionErrorCode | 'unknown'
}

/**
 * The last screen's own fields: the sender's private address, a note to the coordinator and the
 * security check. The Send button lives in the sheet footer and submits this by id. It mounts
 * only on the last screen, so each visit renders a fresh challenge.
 */
export function SendForm({
  draft,
  correction,
  sender,
  onSender,
  context,
  notePrefix,
  noteOpen = false,
  onInvalid,
  onSent,
  onState,
  initialRefusal,
}: SendFormProps) {
  const { t } = useTranslation()
  const [emailError, setEmailError] = useState(false)
  const [noChanges, setNoChanges] = useState(false)
  const [showNote, setShowNote] = useState(noteOpen || Boolean(sender.note))
  const { challengeRef, token, status, reset } = useTurnstile()
  const emailRef = useRef<HTMLInputElement>(null)

  const mutation = useMutation({
    // A re-sent proposal would replay a single-use token the server already redeemed.
    retry: 0,
    // Offline, the default would pause this behind a spinner that never resolves.
    networkMode: 'always',
    mutationFn: ({ built, captcha }: { built: BuiltProposal; captcha: string }) =>
      proposalApi.sendProposal({
        ...built,
        senderEmail: sender.email.trim(),
        note: [notePrefix, sender.note.trim()].filter(Boolean).join('\n') || undefined,
        turnstileToken: captcha,
        context,
      }),
    onSuccess: onSent,
    // The token in hand is spent whatever the refusal was, so the retry needs a fresh one.
    onError: reset,
  })

  const report = useRef(onState)

  report.current = onState
  useLayoutEffect(() => {
    report.current({ ready: Boolean(token), pending: mutation.isPending })
  }, [token, mutation.isPending])

  const refusal =
    (initialRefusal !== undefined || mutation.isError) &&
    t(
      refusalCopyKey(
        initialRefusal ?? mutation.error,
        REFUSAL_MESSAGE_KEYS,
        'submit.errors.send_failed',
      ),
    )

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      id={SEND_FORM_ID}
      onSubmit={(event) => {
        event.preventDefault()
        setNoChanges(false)

        const invalid = firstInvalidStep(draft, correction?.baseDraft)

        if (invalid) return onInvalid(invalid)
        if (!isEmail(sender.email)) {
          setEmailError(true)
          emailRef.current?.focus()

          return
        }
        setEmailError(false)

        const built = buildProposal(draft, correction)
        const unchanged =
          Object.keys(built.proposed).length === 0 && Object.keys(built.location).length === 0

        // A note alone is a correction too; so is "it has stopped", which the prefix carries.
        if (correction && unchanged && !sender.note.trim() && !notePrefix) {
          return setNoChanges(true)
        }
        if (token) mutation.mutate({ built, captcha: token })
      }}
    >
      <FormField
        required
        error={emailError && t('submit.errors.email')}
        help={t('submit.review.email_help')}
        htmlFor="send-email"
        label={t('submit.review.email_label')}
      >
        <Input
          ref={emailRef}
          aria-describedby={fieldDescribedBy({
            name: 'send-email',
            help: !emailError,
            error: emailError,
          })}
          autoComplete="email"
          className="h-12 text-base"
          id="send-email"
          inputMode="email"
          isInvalid={emailError}
          type="email"
          value={sender.email}
          onChange={(event) => onSender({ email: event.target.value })}
        />
      </FormField>

      {showNote ? (
        <FormField htmlFor="send-note" label={t('submit.review.note_label')}>
          <Textarea
            className="text-base"
            id="send-note"
            maxLength={userSubmissionValueMax('note')}
            rows={3}
            value={sender.note}
            onChange={(event) => onSender({ note: event.target.value })}
          />
        </FormField>
      ) : (
        <Button
          className="-mt-1 self-start"
          color="primary"
          size="sm"
          variant="ghost"
          onClick={() => setShowNote(true)}
        >
          {t('submit.ask.note_add')}
        </Button>
      )}

      <div ref={challengeRef} className="empty:hidden" />

      {status === 'blocked' && (
        <Alert color="danger" description={t('common.report.blocked')} role="alert" size="sm" />
      )}
      {noChanges && (
        <Alert
          color="neutral"
          description={t('submit.review.no_changes')}
          role="status"
          size="sm"
        />
      )}
      {refusal && <Alert color="danger" description={refusal} role="alert" size="sm" />}
    </form>
  )
}
