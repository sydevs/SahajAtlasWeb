import type { TranslationKey } from '@/types/i18next'
import type { UserSubmissionErrorCode } from '@/config/api/mutate'
import type { ReportContext } from '@/lib/report'
import type {
  BuiltProposal,
  FixIntent,
  ListingDraft,
  ListingErrors,
  ListingSection,
  ListingSender,
  ListingStep,
  PickedPlace,
} from '@/lib/proposal'
import type { Event } from '@/types'
import type { GeocodingFeature } from '@mapbox/search-js-core'
import type { FormEvent, ReactNode } from 'react'

import { useEffect, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Check } from 'lucide-react'

import { CheckStep } from './CheckStep'
import { DetailsStep } from './DetailsStep'
import { FixStep, NoteStep } from './FixStep'
import { PlaceStep } from './PlaceStep'
import { StepProgress } from './StepProgress'
import { TimeStep } from './TimeStep'

import { Button } from '@/components/atoms/Button'
import { DrawerBody, DrawerFooter, DrawerHeader } from '@/components/atoms/Drawer'
import proposalApi from '@/config/api/proposal'
import { refusalCopyKey } from '@/config/api/mutate'
import { useTurnstile } from '@/hooks/use-turnstile'
import {
  LISTING_STEPS,
  buildProposal,
  draftPlace,
  featureToPlace,
  firstInvalidStep,
  isEmail,
  stepErrors,
} from '@/lib/proposal'
import { submitTitleKey } from '@/lib/shape'
import { viewerTimeZone } from '@/lib/time'

/** The copy for each refusal the proposal intake can return. */
const REFUSAL_MESSAGE_KEYS: Record<UserSubmissionErrorCode, TranslationKey> = {
  captcha_failed: 'submit.errors.captcha',
  captcha_unavailable: 'submit.errors.send_failed',
  invalid_email: 'submit.errors.email',
  disposable_email: 'submit.errors.disposable_email',
  urls_not_allowed: 'submit.errors.urls_not_allowed',
  content_unscannable: 'submit.errors.send_failed',
}

/** How long after a pick a field edit is the geocoder's own echo, not the visitor's. */
const PICK_ECHO_MS = 500

/** The step each of a correction's answers opens on. */
const INTENT_STEPS: Record<FixIntent, ListingStep> = {
  when: 'when',
  where: 'where',
  details: 'details',
  stopped: 'note',
  other: 'note',
}

export type ProposalFormProps = {
  /** A new listing, or a correction to the published class `correction` names. */
  correction?: { eventId: number; baseDraft: ListingDraft; event?: Event }
  draft: ListingDraft
  step: ListingStep
  onChange: (patch: Partial<ListingDraft>) => void
  onStep: (step: ListingStep) => void
  /** The submitter's address and note, kept beside the draft so an Edit round trip keeps them. */
  sender: ListingSender
  onSender: (patch: Partial<ListingSender>) => void
  /** Whether review has already been reached this session, as the owner records it. */
  reviewed?: boolean
  /** What a correction set out to fix, and the owner's way to record the answer. */
  intent?: FixIntent | null
  onIntent?: (intent: FixIntent, step: ListingStep) => void
  /** Whether the submission has been accepted. The form then shows its receipt. */
  sent: boolean
  onSent: () => void
  onClose: () => void
  /** The context the visitor never types: the route, the host page, the locale. */
  context: ReportContext
  /** Where the place searches start: the region the flow opened from. */
  proximity?: { lng: number; lat: number }
  /** The country the place searches keep to, when the flow opened inside one. */
  country?: string
  /** The zone a picked place implies, when one can be told. */
  timeZoneFor?: (place: PickedPlace) => string | undefined
  /** The languages offered on the details step, beyond the ones already chosen. */
  languageOptions?: string[]
  /** Shown under the place once one is picked — the view's "is it one of these?" check. */
  placeNotice?: ReactNode
  /** The draft as it would publish, for the schedule summary and a correction's diff. */
  listing?: Event
  /** The listing preview Check shows, with its Edit links — the view builds it. */
  preview?: ReactNode
  /** The header's trailing control — the sheet's close button. */
  trailing?: ReactNode
  /** Pins the footer to the visible bottom of a snap-point sheet (the mobile map sheet). */
  stickyFooter?: boolean
  /**
   * Shows a small map under a picked address — where the live map is covered (a phone's sheet)
   * or absent (a map-less embed). Beside a visible map it would only repeat it.
   */
  placeMap?: boolean
  /** Story-only: open the review step showing this refusal, without a real request. */
  initialRefusal?: UserSubmissionErrorCode | 'unknown'
}

/**
 * The add-a-class and correction flow (#147), guided: Place, Time, Details, then Check — the
 * listing as it will look, and the visitor's own address. A correction asks "what needs fixing?"
 * first and opens only the step that fixes it, and its Check lists only what changes.
 *
 * It edits a draft its view owns and sends it as a `proposal` submission. It renders the whole
 * sheet content — header, scrolling body, footer — so its Continue is always within reach.
 */
export function ProposalForm(props: ProposalFormProps) {
  const { t } = useTranslation()
  const { correction, step, onStep, reviewed: reviewedProp = false, sent, trailing } = props
  const index = LISTING_STEPS.indexOf(step as (typeof LISTING_STEPS)[number])
  const [seenReview, setSeenReview] = useState(false)
  // The step Check sent the visitor back to because it is incomplete, so it opens flagged.
  const [bounced, setBounced] = useState<ListingStep | null>(null)

  // Once Check has been seen, a step reached from it returns there — never through every step
  // after it again. The owner's `reviewed` carries this across a remount.
  // Recorded during render, so however Check was reached — a step, a remount, an owner that
  // opened there — leaving it already knows to come back.
  if (step === 'review' && !seenReview) setSeenReview(true)

  const reviewed = reviewedProp || seenReview || step === 'review'
  const go = onStep

  return (
    <>
      <DrawerHeader className="flex-col items-stretch gap-3">
        <div className="flex items-start justify-between gap-2 ps-2">
          <div className="min-w-0">
            <h2 className="truncate text-lg leading-tight font-semibold">
              {t(submitTitleKey(correction ? 'correct' : 'add'))}
            </h2>
            {correction?.event && !sent && (
              <p className="line-clamp-2 text-sm leading-snug text-gray-11">
                {correction.event.title}
              </p>
            )}
          </div>
          {trailing}
        </div>
        {!correction && !sent && index >= 0 && (
          <StepProgress
            className="px-2"
            current={index}
            reachable={reviewed ? LISTING_STEPS.length - 1 : index}
            onPick={(at) => go(LISTING_STEPS[at])}
          />
        )}
      </DrawerHeader>

      {sent ? (
        <Receipt
          correction={Boolean(correction)}
          draft={props.draft}
          email={props.sender.email}
          onClose={props.onClose}
        />
      ) : step === 'review' ? (
        <ReviewStage
          {...props}
          onBounce={(invalid) => {
            setBounced(invalid)
            onStep(invalid)
          }}
          onGo={go}
        />
      ) : (
        <StepStage
          {...props}
          flagged={bounced === step}
          index={index}
          reviewed={reviewed}
          onGo={(next) => {
            setBounced(null)
            onStep(next)
          }}
        />
      )}
    </>
  )
}

type StageProps = ProposalFormProps & { onGo: (step: ListingStep) => void }

/** Focuses the first field a failed Continue flagged, once it has rendered as invalid. */
function useFocusFirstInvalid(trigger: unknown) {
  const scope = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!trigger) return
    scope.current
      ?.querySelector<HTMLElement>('[aria-invalid="true"], [data-invalid] input')
      ?.focus()
  }, [trigger])

  return scope
}

/** Every step but Check: its fields, and Back / Continue. */
function StepStage({
  correction,
  draft,
  step,
  index,
  reviewed,
  intent = null,
  onIntent,
  onChange,
  sender,
  onSender,
  proximity,
  country,
  timeZoneFor,
  languageOptions = [],
  placeNotice,
  listing,
  stickyFooter,
  placeMap,
  flagged,
  onGo,
}: StageProps & { index: number; reviewed: boolean; flagged: boolean }) {
  const { t } = useTranslation()
  // Errors show once a step has been attempted — or Check sent the visitor back to it — never
  // while it is first being filled in.
  const [attempted, setAttempted] = useState<{ step: ListingStep; at: number } | null>(() =>
    flagged ? { step, at: Date.now() } : null,
  )
  const base = correction?.baseDraft
  const fields = step !== 'note' && step !== 'fix'
  const errors: ListingErrors =
    fields && attempted?.step === step ? stepErrors(step, draft, base) : {}
  const noteMissing = attempted?.step === 'note' && intent === 'other' && !sender.note.trim()
  const scope = useFocusFirstInvalid(attempted?.at)

  // The geocoder may write its own label into the field right after a pick. Any edit after that
  // means the text no longer names the pick, so the pick is dropped and must be redone.
  const pickedAt = useRef(0)
  const pick = (key: 'address' | 'city') => (feature: GeocodingFeature) => {
    const place = featureToPlace(feature)

    pickedAt.current = Date.now()
    // Without a nearby class to lend one, the visitor's own zone — never one inferred earlier.
    onChange({ [key]: place, timeZone: timeZoneFor?.(place) ?? viewerTimeZone() })
  }
  const edit = (key: 'address' | 'city') => () => {
    if (Date.now() - pickedAt.current < PICK_ECHO_MS) return
    if (draft[key]) onChange({ [key]: null })
  }

  // A correction, and any step reached back from Check, goes straight on to Check.
  const onward: ListingStep =
    correction || reviewed ? 'review' : (LISTING_STEPS[index + 1] ?? 'review')
  let back: ListingStep | null = LISTING_STEPS[index - 1] ?? null

  if (reviewed) back = 'review'
  else if (correction) back = 'fix'

  const advance = (event: FormEvent) => {
    event.preventDefault()
    if (step === 'fix') return

    const invalid =
      step === 'note'
        ? intent === 'other' && !sender.note.trim()
        : Object.keys(stepErrors(step, draft, base)).length > 0

    if (invalid) return setAttempted({ step, at: Date.now() })
    setAttempted(null)
    onGo(onward)
  }

  return (
    <form noValidate className="contents" onSubmit={advance}>
      <DrawerBody key={step} className={stickyFooter ? 'pb-24' : undefined}>
        <div ref={scope} className="px-6 pt-2 pb-8">
          {step === 'fix' && (
            <FixStep
              onPick={(picked) => {
                setAttempted(null)
                onIntent?.(picked, INTENT_STEPS[picked])
              }}
            />
          )}
          {step === 'note' && (intent === 'stopped' || intent === 'other') && (
            <NoteStep
              error={noteMissing && t('submit.note.other_required')}
              intent={intent}
              sender={sender}
              onSender={onSender}
            />
          )}
          {step === 'where' && (
            <PlaceStep
              country={country}
              draft={draft}
              errors={errors}
              notice={placeNotice}
              proximity={proximity}
              showMap={placeMap}
              onChange={onChange}
              onEdit={edit}
              onPick={pick}
            />
          )}
          {step === 'when' && (
            <TimeStep draft={draft} errors={errors} listing={listing} onChange={onChange} />
          )}
          {step === 'details' && (
            <DetailsStep
              draft={draft}
              errors={errors}
              languageOptions={languageOptions}
              onChange={onChange}
            />
          )}
        </div>
      </DrawerBody>
      {step !== 'fix' && (
        <FlowFooter sticky={stickyFooter}>
          {back && (
            <Button size="lg" variant="flat" onClick={() => onGo(back)}>
              {t('submit.chrome.back')}
            </Button>
          )}
          <Button
            className="ms-auto min-w-32"
            color="primary"
            size="lg"
            type="submit"
            variant="solid"
          >
            {t(reviewed ? 'submit.chrome.done_editing' : 'submit.chrome.continue')}
          </Button>
        </FlowFooter>
      )}
    </form>
  )
}

/**
 * Check: the listing or the diff, the visitor's address, the challenge, and Send. It mounts only
 * here, so each visit renders a fresh challenge rather than holding a token that may expire
 * behind the other steps.
 */
function ReviewStage({
  correction,
  draft,
  sender,
  onSender,
  intent = null,
  context,
  listing,
  preview,
  stickyFooter,
  initialRefusal,
  onSent,
  onGo,
  onBounce,
}: StageProps & { onBounce: (step: ListingStep) => void }) {
  const { t } = useTranslation()
  const [emailError, setEmailError] = useState(false)
  const [noChanges, setNoChanges] = useState(false)
  const [attemptAt, setAttemptAt] = useState(0)
  const scope = useFocusFirstInvalid(attemptAt)
  const { challengeRef, token, status, reset } = useTurnstile()
  const base = correction?.baseDraft

  const mutation = useMutation({
    // A re-sent proposal would replay a single-use token the server already redeemed.
    retry: 0,
    // Offline, the default would pause this behind a spinner that never resolves.
    networkMode: 'always',
    mutationFn: ({
      built,
      captcha,
      note,
    }: {
      built: BuiltProposal
      captcha: string
      note?: string
    }) =>
      proposalApi.sendProposal({
        ...built,
        senderEmail: sender.email.trim(),
        note,
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

  const send = (event: FormEvent) => {
    event.preventDefault()
    setNoChanges(false)

    const invalid = firstInvalidStep(draft, base)

    if (invalid) return onBounce(invalid)
    if (!isEmail(sender.email)) {
      setEmailError(true)
      setAttemptAt(Date.now())

      return
    }
    setEmailError(false)

    const built = buildProposal(draft, correction)
    // A new place re-places the class through `location` alone, so it counts as a change.
    const unchanged =
      Object.keys(built.proposed).length === 0 && Object.keys(built.location).length === 0
    // "It has stopped running" is a report even when the visitor adds nothing to it.
    const note =
      sender.note.trim() || (intent === 'stopped' ? t('submit.note.stopped_default') : undefined)

    // A note alone is a correction too: "this class no longer meets" has no field to change.
    if (correction && unchanged && !note) return setNoChanges(true)
    if (token) mutation.mutate({ built, captcha: token, note })
  }

  const back: ListingStep = correction ? (intent ? INTENT_STEPS[intent] : 'fix') : 'details'

  return (
    <form noValidate className="contents" onSubmit={send}>
      <DrawerBody className={stickyFooter ? 'pb-24' : undefined}>
        <div ref={scope} className="px-6 pt-2 pb-8">
          <CheckStep
            challengeBlocked={status === 'blocked'}
            challengeRef={challengeRef}
            correction={
              correction && { baseDraft: correction.baseDraft, event: correction.event, intent }
            }
            draft={draft}
            emailError={emailError}
            listing={listing}
            noChanges={noChanges}
            preview={preview}
            refusal={refusal}
            sender={sender}
            onEdit={(section: ListingSection | 'note') => onGo(section)}
            onSender={onSender}
          />
        </div>
      </DrawerBody>
      <FlowFooter sticky={stickyFooter}>
        <Button size="lg" variant="flat" onClick={() => onGo(back)}>
          {t('submit.chrome.back')}
        </Button>
        <Button
          className="ms-auto min-w-40"
          color="primary"
          disabled={!token}
          isLoading={mutation.isPending}
          size="lg"
          type="submit"
          variant="solid"
        >
          {t('submit.review.send')}
        </Button>
      </FlowFooter>
    </form>
  )
}

function FlowFooter({ sticky, children }: { sticky?: boolean; children: ReactNode }) {
  return (
    <DrawerFooter
      className="flex items-center gap-2 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      sticky={sticky}
    >
      {children}
    </DrawerFooter>
  )
}

/** What a sent submission leaves: who checks it, where we'll write, and the way back. */
function Receipt({
  correction,
  draft,
  email,
  onClose,
}: {
  /** A correction changes a listed class; a new listing appears. The receipt says which. */
  correction: boolean
  draft: ListingDraft
  email: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const city = draftPlace(draft)?.city

  return (
    <DrawerBody>
      <div className="flex flex-col items-center gap-4 px-6 pt-10 pb-10 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-primary-3 text-primary-11">
          <Check aria-hidden size={28} strokeWidth={2.5} />
        </span>
        <div className="flex max-w-80 flex-col gap-2" role="status">
          <h3 className="text-lg font-semibold">{t('submit.done.heading')}</h3>
          <p className="text-sm leading-relaxed text-gray-11">
            {correction
              ? city
                ? t('submit.done.body_correct', { city })
                : t('submit.done.body_correct_no_city')
              : city
                ? t('submit.done.body_check', { city })
                : t('submit.done.body_check_no_city')}{' '}
            {email.trim() && t('submit.done.email_line', { email: email.trim() })}
          </p>
        </div>
        <Button
          className="mt-2 min-w-48"
          color="primary"
          size="lg"
          variant="solid"
          onClick={onClose}
        >
          {t('submit.done.back')}
        </Button>
      </div>
    </DrawerBody>
  )
}
