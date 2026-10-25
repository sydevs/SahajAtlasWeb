import type { TranslationKey } from '@/types/i18next'
import type { UserSubmissionErrorCode } from '@/config/api/mutate'
import type { ReportContext } from '@/lib/report'
import type { BuiltProposal, ListingDraft, ListingSender, ListingStep } from '@/lib/proposal'
import type { ReactNode } from 'react'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { TOUCH } from './fields'

import { Alert } from '@/components/atoms/Alert'
import { Button } from '@/components/atoms/Button'
import { DrawerBody, DrawerFooter } from '@/components/atoms/Drawer'
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

const FORM_ID = 'submit-send-form'

export type SendFormProps = {
  draft: ListingDraft
  /** A correction to the published class `correction` names. */
  correction?: { eventId: number; baseDraft: ListingDraft }
  sender: ListingSender
  onSender: (patch: Partial<ListingSender>) => void
  /** The context the visitor never types: the route, the host page, the locale. */
  context: ReportContext
  /** A section the listing still needs, so the view can take the visitor back to it. */
  onInvalid: (step: ListingStep) => void
  onSent: () => void
  /** What is being sent — the listing card, or a correction's changes — above the form. */
  children?: ReactNode
  /** Pins the send button to the viewport edge of a bottom sheet. */
  stickyFooter?: boolean
  /** Story-only: show this refusal without a real request. */
  initialRefusal?: UserSubmissionErrorCode | 'unknown'
}

/**
 * The last step of adding or correcting a class (#147): who is sending it, a note for the
 * coordinator, the security check, and Send. It mounts only here, so each visit renders a fresh
 * challenge rather than holding a token that may expire while the listing is being written.
 */
export function SendForm({
  draft,
  correction,
  sender,
  onSender,
  context,
  onInvalid,
  onSent,
  children,
  stickyFooter = false,
  initialRefusal,
}: SendFormProps) {
  const { t } = useTranslation()
  const [emailError, setEmailError] = useState(false)
  const [noChanges, setNoChanges] = useState(false)
  const { challengeRef, token, status, reset } = useTurnstile()

  const mutation = useMutation({
    // A re-sent proposal would replay a single-use token the server already redeemed.
    retry: 0,
    // Offline, the default would pause this behind a spinner that never resolves.
    networkMode: 'always',
    mutationFn: ({ built, captcha }: { built: BuiltProposal; captcha: string }) =>
      proposalApi.sendProposal({
        ...built,
        senderEmail: sender.email.trim(),
        note: sender.note.trim() || undefined,
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
    <>
      <DrawerBody className={stickyFooter ? 'pb-24' : undefined}>
        <form
          noValidate
          className="flex flex-col gap-5 px-4 pt-1 pb-6 md:px-6"
          id={FORM_ID}
          onSubmit={(event) => {
            event.preventDefault()
            setNoChanges(false)

            const invalid = firstInvalidStep(draft, correction?.baseDraft)

            if (invalid) return onInvalid(invalid)
            if (!isEmail(sender.email)) return setEmailError(true)
            setEmailError(false)

            const built = buildProposal(draft, correction)
            // A new place re-places the class through `location` alone, so it counts as a change.
            const unchanged =
              Object.keys(built.proposed).length === 0 && Object.keys(built.location).length === 0

            // A note alone is a correction too: "this class no longer meets" has no field to change.
            if (correction && unchanged && !sender.note.trim()) return setNoChanges(true)
            if (token) mutation.mutate({ built, captcha: token })
          }}
        >
          {children}

          <FormField
            required
            error={emailError && t('submit.errors.email')}
            help={t('submit.review.email_help')}
            htmlFor="submit-sender-email"
            label={t('submit.review.email_label')}
          >
            <Input
              aria-describedby={fieldDescribedBy({
                name: 'submit-sender-email',
                help: !emailError,
                error: emailError,
              })}
              autoComplete="email"
              className={TOUCH}
              id="submit-sender-email"
              inputMode="email"
              isInvalid={emailError}
              type="email"
              value={sender.email}
              onChange={(event) => onSender({ email: event.target.value })}
            />
          </FormField>

          <FormField htmlFor="submit-note" label={t('submit.review.note_label')}>
            <Textarea
              className="text-base md:text-sm"
              id="submit-note"
              maxLength={userSubmissionValueMax('note')}
              rows={3}
              value={sender.note}
              onChange={(event) => onSender({ note: event.target.value })}
            />
          </FormField>

          <div ref={challengeRef} className="empty:hidden" />

          {status === 'blocked' && (
            <Alert color="danger" description={t('common.errors.captcha_blocked')} size="sm" />
          )}
          {noChanges && (
            <Alert
              color="neutral"
              description={t('submit.review.note_needed')}
              role="status"
              size="sm"
            />
          )}
          {refusal && <Alert color="danger" description={refusal} role="alert" size="sm" />}
        </form>
      </DrawerBody>
      <DrawerFooter className="border-t border-divider px-4 py-3 md:px-6" sticky={stickyFooter}>
        <Button
          className="h-12 w-full text-base md:h-11"
          color="primary"
          disabled={!token}
          form={FORM_ID}
          isLoading={mutation.isPending}
          type="submit"
          variant="solid"
        >
          {t('submit.review.send')}
        </Button>
      </DrawerFooter>
    </>
  )
}
