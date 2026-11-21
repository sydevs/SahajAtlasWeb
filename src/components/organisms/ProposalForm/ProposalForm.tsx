import type { UserSubmissionErrorCode } from '@/config/api/mutate'
import type { ReportContext } from '@/lib/report'
import type {
  ListingDraft,
  ListingErrors,
  ListingSender,
  ListingStep,
  PickedPlace,
} from '@/lib/proposal'
import type { GeocodingFeature } from '@mapbox/search-js-core'
import type { ReactNode } from 'react'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { AboutStep } from './AboutStep'
import { ContactStep } from './ContactStep'
import { MoreStep } from './MoreStep'
import { ReviewBar } from './ReviewBar'
import { WhenStep } from './WhenStep'
import { WhereStep } from './WhereStep'

import { submitTitleKey } from '@/lib/shape'
import { viewerTimeZone } from '@/lib/time'
import { Button } from '@/components/atoms/Button'
import { LISTING_STEPS, draftPlace, featureToPlace, stepErrors } from '@/lib/proposal'

export type ProposalFormProps = {
  /** A new listing, or a correction to the published class `correction` names. */
  correction?: { eventId: number; baseDraft: ListingDraft }
  draft: ListingDraft
  step: ListingStep
  onChange: (patch: Partial<ListingDraft>) => void
  onStep: (step: ListingStep) => void
  /** The submitter's address and note, kept beside the draft so an Edit round trip keeps them. */
  sender: ListingSender
  onSender: (patch: Partial<ListingSender>) => void
  /** Whether review has already been reached this session, as the owner records it. */
  reviewed?: boolean
  /** Whether the submission has been accepted. The form then shows its receipt. */
  sent: boolean
  onSent: () => void
  onClose: () => void
  /** The context the visitor never types: the route, the host page, the locale. */
  context: ReportContext
  /** Where the place searches start: the region the flow opened from. */
  proximity?: { lng: number; lat: number }
  /** The zone a picked place implies, when one can be told. */
  timeZoneFor?: (place: PickedPlace) => string | undefined
  /** The languages offered on the details step, beyond the ones already chosen. */
  languageOptions?: string[]
  /** The header's trailing control — the panel's close button. */
  trailing?: ReactNode
  /** Story-only: open the review step showing this refusal, without a real request. */
  initialRefusal?: UserSubmissionErrorCode | 'unknown'
}

/**
 * The add-a-class and correction panel (#147): Where, When, Contact, About and Review, with an
 * optional details step off Review. It edits a draft its view owns — the live listing behind
 * the panel renders the same draft — and sends it as a `proposal` submission.
 *
 * Contact and About may be skipped. A correction opens on Review and sends only what changed.
 */
export function ProposalForm({
  correction,
  draft,
  step,
  onChange,
  onStep,
  reviewed = false,
  sender,
  onSender,
  sent,
  onSent,
  onClose,
  context,
  proximity,
  timeZoneFor,
  languageOptions = [],
  trailing,
  initialRefusal,
}: ProposalFormProps) {
  const { t } = useTranslation()
  // Errors show once a step has been attempted, never while it is first being filled in.
  const [attempted, setAttempted] = useState<ListingStep | null>(null)
  const base = correction?.baseDraft
  const errors: ListingErrors = attempted === step ? stepErrors(step, draft, base) : {}
  const index = LISTING_STEPS.indexOf(step as (typeof LISTING_STEPS)[number])
  // Once review has been seen — a correction opens there — a step reached by an Edit link
  // returns to review, rather than walking the visitor through every step after it again.
  // The owner tracks it, so a remount keeps it.
  const onward = reviewed || step === 'more' ? 'review' : (LISTING_STEPS[index + 1] ?? 'review')

  const go = (next: ListingStep) => {
    setAttempted(null)
    onStep(next)
  }

  const advance = () => {
    if (Object.keys(stepErrors(step, draft, base)).length > 0) {
      setAttempted(step)

      return
    }
    go(onward)
  }

  const pick = (key: 'address' | 'city') => (feature: GeocodingFeature) => {
    const place = featureToPlace(feature)

    // Without a nearby class to lend one, the visitor's own zone — never one inferred earlier.
    onChange({ [key]: place, timeZone: timeZoneFor?.(place) ?? viewerTimeZone() })
  }

  if (sent) {
    const city = draftPlace(draft)?.city

    return (
      <div className="flex flex-col gap-4 p-4">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-lg font-semibold">{t('submit.done.title')}</h2>
          {trailing}
        </div>
        <p className="text-sm">
          {city ? t('submit.done.body', { city }) : t('submit.done.body_no_city')}
        </p>
        <Button className="self-end" color="primary" variant="flat" onClick={onClose}>
          {t('common.chrome.close')}
        </Button>
      </div>
    )
  }

  const backTo: ListingStep | undefined = step === 'more' ? 'review' : LISTING_STEPS[index - 1]

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-lg leading-tight font-semibold">
            {t(submitTitleKey(correction ? 'correct' : 'add'))}
          </h2>
          {index >= 0 && (
            <p className="text-sm text-gray-11">
              {t('submit.chrome.step_progress', { step: index + 1, total: LISTING_STEPS.length })}
            </p>
          )}
        </div>
        {trailing}
      </div>

      {step === 'where' && (
        <WhereStep
          draft={draft}
          errors={errors}
          proximity={proximity}
          onChange={onChange}
          onPick={pick}
        />
      )}
      {step === 'when' && <WhenStep draft={draft} errors={errors} onChange={onChange} />}
      {step === 'contact' && <ContactStep draft={draft} errors={errors} onChange={onChange} />}
      {step === 'about' && <AboutStep draft={draft} onChange={onChange} />}
      {step === 'more' && (
        <MoreStep
          draft={draft}
          errors={errors}
          languageOptions={languageOptions}
          onChange={onChange}
        />
      )}
      {step === 'review' && (
        <ReviewBar
          context={context}
          correction={correction}
          draft={draft}
          initialRefusal={initialRefusal}
          sender={sender}
          onInvalid={(invalid) => {
            setAttempted(invalid)
            onStep(invalid)
          }}
          onMore={() => go('more')}
          onSender={onSender}
          onSent={onSent}
        />
      )}

      {step !== 'review' && (
        <div className="flex flex-wrap justify-end gap-2">
          {backTo && (
            // The details step is a detour off review, so going back is how it is left.
            <Button variant="flat" onClick={() => (step === 'more' ? advance() : go(backTo))}>
              {t('submit.chrome.back')}
            </Button>
          )}
          {(step === 'contact' || step === 'about') && (
            <Button variant="ghost" onClick={() => go(onward)}>
              {t('submit.chrome.skip')}
            </Button>
          )}
          {step !== 'more' && (
            <Button color="primary" variant="flat" onClick={advance}>
              {t('submit.chrome.next')}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
