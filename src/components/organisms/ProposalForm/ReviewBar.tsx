import type { TranslationKey } from '@/types/i18next'
import type { UserSubmissionErrorCode } from '@/config/api/mutate'
import type { ReportContext } from '@/lib/report'
import type { BuiltProposal, ListingDraft, ListingSender, ListingStep } from '@/lib/proposal'
import type { ProposalFormProps } from './ProposalForm'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { ValidatedInput } from './fields'

import { Alert } from '@/components/atoms/Alert'
import { Button } from '@/components/atoms/Button'
import { Textarea } from '@/components/atoms/Textarea'
import { FormField } from '@/components/molecules/FormField'
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

/**
 * The minimal bar the panel shrinks to on review: the submitter's own address, a note to the
 * reviewer, the challenge, and the two ways on. It mounts only here, so each visit renders a
 * fresh challenge rather than holding a token that may expire behind the other steps.
 */
export function ReviewBar({
  correction,
  draft,
  context,
  onInvalid,
  onMore,
  onSent,
  initialRefusal,
  sender,
  onSender,
}: {
  sender: ListingSender
  onSender: ProposalFormProps['onSender']
  correction?: ProposalFormProps['correction']
  draft: ListingDraft
  context: ReportContext
  onInvalid: (step: ListingStep) => void
  onMore: () => void
  onSent: () => void
  initialRefusal?: ProposalFormProps['initialRefusal']
}) {
  const { t } = useTranslation()
  const senderEmail = sender.email
  const note = sender.note
  const [emailError, setEmailError] = useState(false)
  const [noChanges, setNoChanges] = useState(false)
  const { challengeRef, token, reset } = useTurnstile()

  const mutation = useMutation({
    // A re-sent proposal would replay a single-use token the server already redeemed.
    retry: 0,
    // Offline, the default would pause this behind a spinner that never resolves.
    networkMode: 'always',
    mutationFn: ({ built, captcha }: { built: BuiltProposal; captcha: string }) =>
      proposalApi.sendProposal({
        ...built,
        senderEmail: senderEmail.trim(),
        note: note.trim() || undefined,
        turnstileToken: captcha,
        context,
      }),
    onSuccess: onSent,
    // The token in hand is spent whatever the refusal was, so the retry needs a fresh one.
    onError: reset,
  })

  // Every refusal renders a sentence: a code this build does not know reads as a send failure.
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
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        setNoChanges(false)

        const invalid = firstInvalidStep(draft, correction?.baseDraft)

        if (invalid) return onInvalid(invalid)
        if (!isEmail(senderEmail)) return setEmailError(true)
        setEmailError(false)

        const built = buildProposal(draft, correction)

        // A new place re-places the class through `location` alone, so it counts as a change.
        const unchanged =
          Object.keys(built.proposed).length === 0 && Object.keys(built.location).length === 0

        if (correction && unchanged) return setNoChanges(true)
        if (token) mutation.mutate({ built, captcha: token })
      }}
    >
      <ValidatedInput
        required
        autoComplete="email"
        error={emailError && t('submit.errors.email')}
        help={t('submit.review.email_help')}
        id="submit-sender-email"
        label={t('submit.review.email_label')}
        type="email"
        value={senderEmail}
        onChange={(event) => onSender({ email: event.target.value })}
      />
      <FormField htmlFor="submit-note" label={t('submit.review.note_label')}>
        <Textarea
          id="submit-note"
          maxLength={userSubmissionValueMax('note')}
          rows={2}
          value={note}
          onChange={(event) => onSender({ note: event.target.value })}
        />
      </FormField>

      <div ref={challengeRef} className="empty:hidden" />

      {noChanges && <Alert color="neutral" description={t('submit.review.no_changes')} size="sm" />}
      {refusal && <Alert color="danger" description={refusal} role="alert" size="sm" />}

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="flat" onClick={onMore}>
          {t('submit.review.add_more')}
        </Button>
        <Button
          color="primary"
          disabled={!token}
          isLoading={mutation.isPending}
          type="submit"
          variant="solid"
        >
          {t('submit.review.submit')}
        </Button>
      </div>
    </form>
  )
}
