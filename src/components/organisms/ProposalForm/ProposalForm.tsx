import type { TranslationKey } from '@/types/i18next'
import type { UserSubmissionErrorCode } from '@/config/api/mutate'
import type { ReportContext } from '@/lib/report'
import type { ListingDraft, ListingErrors, ListingStep, PickedPlace } from '@/lib/proposal'
import type { GeocodingFeature } from '@mapbox/search-js-core'
import type { ReactNode } from 'react'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ChevronDown } from 'lucide-react'

import { Alert } from '@/components/atoms/Alert'
import { Button } from '@/components/atoms/Button'
import { Checkbox } from '@/components/atoms/Checkbox'
import { Dropdown } from '@/components/atoms/Dropdown'
import { Input } from '@/components/atoms/Input'
import { fieldChrome } from '@/components/atoms/Select'
import { Textarea } from '@/components/atoms/Textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/atoms/ToggleGroup'
import { FormField, fieldDescribedBy } from '@/components/molecules/FormField'
import { MapSearch } from '@/components/organisms/Mapbox/MapSearch'
import api from '@/config/api'
import {
  USER_SUBMISSION_VALUE_MAX,
  UserSubmissionError,
  userSubmissionValueMax,
} from '@/config/api/mutate'
import { useLocale } from '@/hooks/use-locale'
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

/**
 * The copy for each refusal the proposal intake can return. Two codes have none of their own:
 * neither an unreachable captcha service nor a patch the screener could not read is something a
 * visitor fixes by editing a field, so both read as the generic send failure — the same
 * convention `ReportIssueForm` follows.
 */
const REFUSAL_MESSAGE_KEYS: Record<UserSubmissionErrorCode, TranslationKey> = {
  captcha_failed: 'submit.errors.captcha',
  captcha_unavailable: 'submit.errors.send_failed',
  invalid_email: 'submit.errors.email',
  disposable_email: 'submit.errors.disposable_email',
  urls_not_allowed: 'submit.errors.urls_not_allowed',
  content_unscannable: 'submit.errors.send_failed',
}

/** Every refusal renders a sentence: a code this build does not know reads as a send failure. */
const refusalMessageKey = (error: unknown): TranslationKey =>
  error instanceof UserSubmissionError && error.code in REFUSAL_MESSAGE_KEYS
    ? REFUSAL_MESSAGE_KEYS[error.code]
    : 'submit.errors.send_failed'

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
  const errors: ListingErrors = attempted === step ? stepErrors(step, draft) : {}
  const index = LISTING_STEPS.indexOf(step as (typeof LISTING_STEPS)[number])

  const go = (next: ListingStep) => {
    setAttempted(null)
    onStep(next)
  }

  const advance = () => {
    if (Object.keys(stepErrors(step, draft)).length > 0) {
      setAttempted(step)

      return
    }
    go(LISTING_STEPS[index + 1] ?? 'review')
  }

  const pick = (key: 'address' | 'city') => (feature: GeocodingFeature) => {
    const place = featureToPlace(feature)
    const timeZone = timeZoneFor?.(place)

    onChange({ [key]: place, ...(timeZone ? { timeZone } : {}) })
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

  const back = (target: ListingStep) => (
    <Button variant="flat" onClick={() => go(target)}>
      {t('submit.chrome.back')}
    </Button>
  )
  const next = (
    <Button color="primary" variant="flat" onClick={advance}>
      {t('submit.chrome.next')}
    </Button>
  )
  const skip = (
    <Button variant="ghost" onClick={() => go(LISTING_STEPS[index + 1])}>
      {t('submit.chrome.skip')}
    </Button>
  )

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-lg leading-tight font-semibold">
            {correction ? t('submit.chrome.title_correct') : t('submit.chrome.title_add')}
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
        <MoreStep draft={draft} languageOptions={languageOptions} onChange={onChange} />
      )}
      {step === 'review' && (
        <ReviewBar
          context={context}
          correction={correction}
          draft={draft}
          initialRefusal={initialRefusal}
          onInvalid={(invalid) => {
            setAttempted(invalid)
            onStep(invalid)
          }}
          onMore={() => go('more')}
          onSent={onSent}
        />
      )}

      {step !== 'review' && (
        <div className="flex flex-wrap justify-end gap-2">
          {step === 'where' && next}
          {step === 'when' && (
            <>
              {back('where')}
              {next}
            </>
          )}
          {(step === 'contact' || step === 'about') && (
            <>
              {back(LISTING_STEPS[index - 1])}
              {skip}
              {next}
            </>
          )}
          {step === 'more' && back('review')}
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
              initialQuery={draft.address?.label ?? ''}
              label={t('submit.where.address_placeholder')}
              proximity={proximity}
              types="address"
              onSelect={onPick('address')}
            />
          </FormField>
          <FormField htmlFor="submit-room" label={t('submit.where.room_label')}>
            <Input
              id="submit-room"
              maxLength={CONTACT_MAX}
              value={draft.room}
              onChange={(event) => onChange({ room: event.target.value })}
            />
          </FormField>
        </>
      ) : (
        <>
          <FormField
            required
            error={errors.onlineUrl && t('submit.errors.online_url')}
            htmlFor="submit-online-url"
            label={t('submit.where.online_url_label')}
          >
            <Input
              aria-describedby={fieldDescribedBy({
                name: 'submit-online-url',
                error: errors.onlineUrl,
              })}
              id="submit-online-url"
              isInvalid={errors.onlineUrl}
              placeholder={t('submit.where.online_url_placeholder')}
              type="url"
              value={draft.onlineUrl}
              onChange={(event) => onChange({ onlineUrl: event.target.value })}
            />
          </FormField>
          <FormField
            required
            error={errors.city && t('submit.errors.city_required')}
            help={t('submit.where.city_help')}
            label={t('submit.where.city_label')}
          >
            <MapSearch
              initialQuery={draft.city?.label ?? ''}
              label={t('submit.where.city_placeholder')}
              proximity={proximity}
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
      <FormField
        required
        error={errors.firstDate && t('submit.errors.first_date')}
        htmlFor="submit-first-date"
        label={t('submit.when.first_date')}
      >
        <Input
          aria-describedby={fieldDescribedBy({
            name: 'submit-first-date',
            error: errors.firstDate,
          })}
          id="submit-first-date"
          isInvalid={errors.firstDate}
          type="date"
          value={draft.firstDate}
          onChange={(event) => onChange({ firstDate: event.target.value })}
        />
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField
          required
          error={errors.startTime && t('submit.errors.start_time')}
          htmlFor="submit-start-time"
          label={t('submit.when.start_time')}
        >
          <Input
            aria-describedby={fieldDescribedBy({
              name: 'submit-start-time',
              error: errors.startTime,
            })}
            id="submit-start-time"
            isInvalid={errors.startTime}
            type="time"
            value={draft.startTime}
            onChange={(event) => onChange({ startTime: event.target.value })}
          />
        </FormField>
        <FormField htmlFor="submit-end-time" label={t('submit.when.end_time')}>
          <Input
            id="submit-end-time"
            type="time"
            value={draft.endTime}
            onChange={(event) => onChange({ endTime: event.target.value })}
          />
        </FormField>
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
        <FormField htmlFor="submit-end-date" label={t('submit.when.end_date')}>
          <Input
            id="submit-end-date"
            min={draft.firstDate || undefined}
            type="date"
            value={draft.endDate}
            onChange={(event) => onChange({ endDate: event.target.value })}
          />
        </FormField>
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
      <FormField htmlFor="submit-contact-name" label={t('submit.contact.name_label')}>
        <Input
          autoComplete="name"
          id="submit-contact-name"
          maxLength={CONTACT_MAX}
          value={draft.contactName}
          onChange={(event) => onChange({ contactName: event.target.value })}
        />
      </FormField>
      <FormField htmlFor="submit-contact-phone" label={t('submit.contact.phone_label')}>
        <Input
          autoComplete="tel"
          id="submit-contact-phone"
          maxLength={CONTACT_MAX}
          type="tel"
          value={draft.contactPhone}
          onChange={(event) => onChange({ contactPhone: event.target.value })}
        />
      </FormField>
      <FormField
        error={errors.contactEmail && t('submit.errors.email')}
        htmlFor="submit-contact-email"
        label={t('submit.contact.email_label')}
      >
        <Input
          aria-describedby={fieldDescribedBy({
            name: 'submit-contact-email',
            error: errors.contactEmail,
          })}
          autoComplete="email"
          id="submit-contact-email"
          isInvalid={errors.contactEmail}
          maxLength={CONTACT_MAX}
          type="email"
          value={draft.contactEmail}
          onChange={(event) => onChange({ contactEmail: event.target.value })}
        />
      </FormField>
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

function MoreStep({ draft, languageOptions, onChange }: StepProps & { languageOptions: string[] }) {
  const { t } = useTranslation()
  const { languageLabel } = useLocale()
  const codes = [...new Set([...draft.languages, ...languageOptions])].sort((a, b) =>
    languageLabel(a).localeCompare(languageLabel(b)),
  )
  const toggle = (code: string) =>
    onChange({
      languages: draft.languages.includes(code)
        ? draft.languages.filter((other) => other !== code)
        : [...draft.languages, code],
    })

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-md font-semibold">{t('submit.more.title')}</h3>
      <FormField
        help={t('submit.more.title_help')}
        htmlFor="submit-title"
        label={t('submit.more.title_label')}
      >
        <Input
          aria-describedby={fieldDescribedBy({ name: 'submit-title', help: true })}
          id="submit-title"
          maxLength={TITLE_MAX}
          value={draft.title}
          onChange={(event) => onChange({ title: event.target.value })}
        />
      </FormField>
      <FormField label={t('submit.more.languages_label')}>
        <Dropdown
          fullWidth
          aria-label={t('submit.more.languages_label')}
          role="dialog"
          trigger={
            <span className={fieldChrome({ trigger: true })}>
              <span className="truncate">{draft.languages.map(languageLabel).join(', ')}</span>
              <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
            </span>
          }
        >
          <div className="max-h-56 overflow-y-auto p-1">
            {codes.map((code) => (
              <Checkbox
                key={code}
                appearance="checkbox"
                checked={draft.languages.includes(code)}
                className="w-full rounded px-2 py-1.5 hover:bg-gray-3"
                onCheckedChange={() => toggle(code)}
              >
                {languageLabel(code)}
              </Checkbox>
            ))}
          </div>
        </Dropdown>
      </FormField>
      <FormField htmlFor="submit-website" label={t('submit.more.website_label')}>
        <Input
          id="submit-website"
          maxLength={USER_SUBMISSION_VALUE_MAX}
          type="url"
          value={draft.website}
          onChange={(event) => onChange({ website: event.target.value })}
        />
      </FormField>
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
}: {
  correction?: ProposalFormProps['correction']
  draft: ListingDraft
  context: ReportContext
  onInvalid: (step: ListingStep) => void
  onMore: () => void
  onSent: () => void
  initialRefusal?: ProposalFormProps['initialRefusal']
}) {
  const { t } = useTranslation()
  const [senderEmail, setSenderEmail] = useState('')
  const [note, setNote] = useState('')
  const [emailError, setEmailError] = useState(false)
  const [noChanges, setNoChanges] = useState(false)
  const { challengeRef, token, reset } = useTurnstile()

  const mutation = useMutation({
    // A re-sent proposal would replay a single-use token the server already redeemed.
    retry: 0,
    // Offline, the default would pause this behind a spinner that never resolves.
    networkMode: 'always',
    mutationFn: (captcha: string) => {
      const built = buildProposal(draft, correction)

      return api.sendProposal({
        ...built,
        senderEmail: senderEmail.trim(),
        note: note.trim() || undefined,
        turnstileToken: captcha,
        context,
      })
    },
    onSuccess: onSent,
    // The token in hand is spent whatever the refusal was, so the retry needs a fresh one.
    onError: reset,
  })

  const refusal =
    initialRefusal === undefined
      ? mutation.isError && t(refusalMessageKey(mutation.error))
      : t(
          initialRefusal === 'unknown'
            ? 'submit.errors.send_failed'
            : REFUSAL_MESSAGE_KEYS[initialRefusal],
        )

  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        setNoChanges(false)

        const invalid = firstInvalidStep(draft)

        if (invalid) return onInvalid(invalid)
        if (!isEmail(senderEmail)) return setEmailError(true)
        setEmailError(false)
        if (correction && Object.keys(buildProposal(draft, correction).proposed).length === 0) {
          return setNoChanges(true)
        }
        if (token) mutation.mutate(token)
      }}
    >
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
          id="submit-sender-email"
          isInvalid={emailError}
          type="email"
          value={senderEmail}
          onChange={(event) => setSenderEmail(event.target.value)}
        />
      </FormField>
      <FormField htmlFor="submit-note" label={t('submit.review.note_label')}>
        <Textarea
          id="submit-note"
          maxLength={userSubmissionValueMax('note')}
          rows={2}
          value={note}
          onChange={(event) => setNote(event.target.value)}
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
