import type { TranslationKey } from '@/types/i18next'
import type { UserSubmissionErrorCode } from '@/config/api/mutate'
import type { ReportContext } from '@/lib/report'
import type {
  BuiltProposal,
  ListingDraft,
  ListingErrors,
  ListingSender,
  ListingStep,
  PickedPlace,
} from '@/lib/proposal'
import type { InputProps } from '@/components/atoms/Input'
import type { GeocodingFeature } from '@mapbox/search-js-core'
import type { ReactNode } from 'react'

import { useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { submitTitleKey } from '@/lib/shape'
import { viewerTimeZone } from '@/lib/time'
import { Alert } from '@/components/atoms/Alert'
import { Button } from '@/components/atoms/Button'
import { Input } from '@/components/atoms/Input'
import { Textarea } from '@/components/atoms/Textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/atoms/ToggleGroup'
import { FormField, fieldDescribedBy } from '@/components/molecules/FormField'
import { MapSearch } from '@/components/organisms/Mapbox/MapSearch'
import proposalApi from '@/config/api/proposal'
import {
  USER_SUBMISSION_VALUE_MAX,
  refusalCopyKey,
  userSubmissionValueMax,
} from '@/config/api/mutate'
import { useLocale } from '@/hooks/use-locale'
import { useLanguageOptions } from '@/hooks/use-language-options'
import { LanguageMultiSelect } from '@/components/molecules/LanguageMultiSelect'
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

/** The copy for each refusal the proposal intake can return. */
const REFUSAL_MESSAGE_KEYS: Record<UserSubmissionErrorCode, TranslationKey> = {
  captcha_failed: 'submit.errors.captcha',
  captcha_unavailable: 'submit.errors.send_failed',
  invalid_email: 'submit.errors.email',
  disposable_email: 'submit.errors.disposable_email',
  urls_not_allowed: 'submit.errors.urls_not_allowed',
  content_unscannable: 'submit.errors.send_failed',
}

/** The Events title's own bound. */
const TITLE_MAX = 100
/** The contact fields' bound on an Event. */
const CONTACT_MAX = 100

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
  const onward =
    reviewed || step === 'more' ? 'review' : (LISTING_STEPS[index + 1] ?? 'review')

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

type StepProps = {
  draft: ListingDraft
  errors?: ListingErrors
  onChange: (patch: Partial<ListingDraft>) => void
}

/** A labelled input whose help and error text are wired to it by id. */
function ValidatedInput({
  id,
  label,
  required,
  help,
  error,
  ...input
}: Omit<InputProps, 'id' | 'isInvalid'> & {
  id: string
  label: string
  required?: boolean
  help?: string
  /** The error sentence, shown in place of the help while set. */
  error?: string | false
}) {
  return (
    <FormField error={error} help={help} htmlFor={id} label={label} required={required}>
      <Input
        aria-describedby={fieldDescribedBy({
          name: id,
          help: Boolean(help) && !error,
          error: Boolean(error),
        })}
        id={id}
        isInvalid={Boolean(error)}
        {...input}
      />
    </FormField>
  )
}

function WhereStep({
  draft,
  errors = {},
  proximity,
  onChange,
  onPick,
}: StepProps & {
  proximity?: { lng: number; lat: number }
  onPick: (key: 'address' | 'city') => (feature: GeocodingFeature) => void
}) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-md font-semibold">{t('submit.where.title')}</h3>
      <ToggleGroup
        joined
        aria-label={t('submit.where.title')}
        type="single"
        value={draft.eventType}
        onValueChange={(value) =>
          value && onChange({ eventType: value as ListingDraft['eventType'] })
        }
      >
        <ToggleGroupItem value="offline">{t('submit.where.offline')}</ToggleGroupItem>
        <ToggleGroupItem value="online">{t('submit.where.online')}</ToggleGroupItem>
      </ToggleGroup>

      {draft.eventType === 'offline' ? (
        <>
          <FormField
            required
            error={errors.address && t('submit.errors.address_required')}
            label={t('submit.where.address_label')}
          >
            <MapSearch
              label={t('submit.where.address_placeholder')}
              proximity={proximity}
              query={{ initial: draft.address?.label ?? '' }}
              types="address"
              onSelect={onPick('address')}
            />
          </FormField>
          <ValidatedInput
            id="submit-room"
            label={t('submit.where.room_label')}
            maxLength={CONTACT_MAX}
            value={draft.room}
            onChange={(event) => onChange({ room: event.target.value })}
          />
        </>
      ) : (
        <>
          <ValidatedInput
            required
            error={errors.onlineUrl && t('submit.errors.online_url')}
            id="submit-online-url"
            label={t('submit.where.online_url_label')}
            placeholder={t('submit.where.online_url_placeholder')}
            type="url"
            value={draft.onlineUrl}
            onChange={(event) => onChange({ onlineUrl: event.target.value })}
          />
          <FormField
            required
            error={errors.city && t('submit.errors.city_required')}
            help={t('submit.where.city_help')}
            label={t('submit.where.city_label')}
          >
            <MapSearch
              label={t('submit.where.city_placeholder')}
              proximity={proximity}
              query={{ initial: draft.city?.label ?? '' }}
              types="place"
              onSelect={onPick('city')}
            />
          </FormField>
        </>
      )}
    </div>
  )
}

function WhenStep({ draft, errors = {}, onChange }: StepProps) {
  const { t } = useTranslation()
  const repeating = draft.repeats !== 'once'

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-md font-semibold">{t('submit.when.title')}</h3>
      <ValidatedInput
        required
        error={errors.firstDate && t('submit.errors.first_date')}
        id="submit-first-date"
        label={t('submit.when.first_date')}
        type="date"
        value={draft.firstDate}
        onChange={(event) => onChange({ firstDate: event.target.value })}
      />
      <div className="grid grid-cols-2 gap-3">
        <ValidatedInput
          required
          error={errors.startTime && t('submit.errors.start_time')}
          id="submit-start-time"
          label={t('submit.when.start_time')}
          type="time"
          value={draft.startTime}
          onChange={(event) => onChange({ startTime: event.target.value })}
        />
        <ValidatedInput
          id="submit-end-time"
          label={t('submit.when.end_time')}
          type="time"
          value={draft.endTime}
          onChange={(event) => onChange({ endTime: event.target.value })}
        />
      </div>
      <p className="-mt-2 text-xs text-gray-11">
        {t('submit.when.timezone_note', { timezone: draft.timeZone })}
      </p>
      <FormField label={t('submit.when.repeats')}>
        <ToggleGroup
          joined
          aria-label={t('submit.when.repeats')}
          type="single"
          value={draft.repeats}
          onValueChange={(value) =>
            value && onChange({ repeats: value as ListingDraft['repeats'] })
          }
        >
          <ToggleGroupItem value="once">{t('filters.cadence.once')}</ToggleGroupItem>
          <ToggleGroupItem value="weekly">{t('filters.cadence.weekly')}</ToggleGroupItem>
          <ToggleGroupItem value="monthly">{t('filters.cadence.monthly')}</ToggleGroupItem>
        </ToggleGroup>
      </FormField>
      {repeating && (
        <ValidatedInput
          id="submit-end-date"
          label={t('submit.when.end_date')}
          min={draft.firstDate || undefined}
          type="date"
          value={draft.endDate}
          onChange={(event) => onChange({ endDate: event.target.value })}
        />
      )}
    </div>
  )
}

function ContactStep({ draft, errors = {}, onChange }: StepProps) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-md font-semibold">{t('submit.contact.title')}</h3>
        <p className="text-sm text-gray-11">{t('submit.contact.help')}</p>
      </div>
      <ValidatedInput
        autoComplete="name"
        id="submit-contact-name"
        label={t('submit.contact.name_label')}
        maxLength={CONTACT_MAX}
        value={draft.contactName}
        onChange={(event) => onChange({ contactName: event.target.value })}
      />
      <ValidatedInput
        autoComplete="tel"
        id="submit-contact-phone"
        label={t('submit.contact.phone_label')}
        maxLength={CONTACT_MAX}
        type="tel"
        value={draft.contactPhone}
        onChange={(event) => onChange({ contactPhone: event.target.value })}
      />
      <ValidatedInput
        autoComplete="email"
        error={errors.contactEmail && t('submit.errors.email')}
        id="submit-contact-email"
        label={t('submit.contact.email_label')}
        maxLength={CONTACT_MAX}
        type="email"
        value={draft.contactEmail}
        onChange={(event) => onChange({ contactEmail: event.target.value })}
      />
    </div>
  )
}

function AboutStep({ draft, onChange }: StepProps) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-md font-semibold">{t('submit.about.title')}</h3>
      <FormField htmlFor="submit-description" label={t('submit.about.description_label')}>
        <Textarea
          id="submit-description"
          maxLength={userSubmissionValueMax('message')}
          placeholder={t('submit.about.description_placeholder')}
          rows={5}
          value={draft.description}
          onChange={(event) => onChange({ description: event.target.value })}
        />
      </FormField>
    </div>
  )
}

function MoreStep({
  draft,
  errors = {},
  languageOptions,
  onChange,
}: StepProps & { languageOptions: string[] }) {
  const { t } = useTranslation()
  const { languageLabel } = useLocale()
  const codes = useMemo(
    () => [...new Set([...draft.languages, ...languageOptions])],
    [draft.languages, languageOptions],
  )
  const options = useLanguageOptions(codes)

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-md font-semibold">{t('submit.more.title')}</h3>
      <ValidatedInput
        help={t('submit.more.title_help')}
        id="submit-title"
        label={t('submit.more.title_label')}
        maxLength={TITLE_MAX}
        value={draft.title}
        onChange={(event) => onChange({ title: event.target.value })}
      />
      <FormField label={t('submit.more.languages_label')}>
        <LanguageMultiSelect
          label={t('submit.more.languages_label')}
          options={options}
          triggerLabel={draft.languages.map(languageLabel).join(', ')}
          value={draft.languages}
          onChange={(languages) => onChange({ languages })}
        />
      </FormField>
      <ValidatedInput
        error={errors.website && t('submit.errors.online_url')}
        id="submit-website"
        label={t('submit.more.website_label')}
        maxLength={USER_SUBMISSION_VALUE_MAX}
        type="url"
        value={draft.website}
        onChange={(event) => onChange({ website: event.target.value })}
      />
    </div>
  )
}

/**
 * The minimal bar the panel shrinks to on review: the submitter's own address, a note to the
 * reviewer, the challenge, and the two ways on. It mounts only here, so each visit renders a
 * fresh challenge rather than holding a token that may expire behind the other steps.
 */
function ReviewBar({
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
