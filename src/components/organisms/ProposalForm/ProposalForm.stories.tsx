import type { Story, StoryDefault } from '@ladle/react'
import type { FixIntent, ListingDraft, ListingStep } from '@/lib/proposal'
import type { DuplicateClass } from './DuplicateNotice'
import type { ProposalFormProps } from './ProposalForm'

import { useState } from 'react'

// Not in the organisms barrel — it is reached only through the lazy submit views.
import { StorySection, StoryWrapper } from '../../ladle'

import { ProposalForm } from './ProposalForm'

import { draftPreviewSchedule, emptyDraft, previewEvent, sampleDraft } from '@/lib/proposal'
import { EMPTY_SENDER } from '@/config/store'

export default { title: 'Organisms' } satisfies StoryDefault

const context = {
  path: '/add',
  pageUrl: 'https://host.example/classes',
  locale: 'en',
  userAgent: 'Ladle',
}

const empty = emptyDraft('Europe/London', ['en'])

/** The sample the deep links open on (`lib/proposal/sample.ts`): Balham Library, Thursdays. */
const filled: ListingDraft = sampleDraft(empty, { step: 'review' })

/** The listing a draft previews as, as the view builds it for Check. */
const asListing = (draft: ListingDraft) =>
  previewEvent(draft, { path: '/gb/south-east/london', schedule: draftPreviewSchedule(draft) })

/** Balham Library's own Wednesday class, which a host re-adding it would be told about. */
const balham: DuplicateClass = {
  id: 939,
  title: 'Evening Meditation at Balham Library',
  path: '/gb/south-east/london/balham-library/939',
  event: asListing({ ...filled, firstDate: '2026-11-18', startTime: '19:30', endTime: '20:45' }),
}

/** A self-contained panel: the story owns the draft its view would hold in the store. */
function Panel({
  initial,
  step: initialStep,
  width = 352,
  ...rest
}: Partial<ProposalFormProps> & { initial: ListingDraft; step: ListingStep; width?: number }) {
  const [draft, setDraft] = useState(initial)
  const [step, setStep] = useState(initialStep)
  const [sent, setSent] = useState(rest.sent ?? false)
  const [sender, setSender] = useState(EMPTY_SENDER)
  const [intent, setIntent] = useState<FixIntent | null>(rest.intent ?? null)
  const [distinct, setDistinct] = useState<number[]>([])

  return (
    // The form renders a whole sheet — header, scrolling body, footer — so it gets a sheet's box.
    <div
      className="flex h-[680px] flex-col overflow-hidden rounded-lg border border-divider bg-background"
      style={{ width }}
    >
      <ProposalForm
        context={context}
        languageOptions={['en', 'fr', 'de', 'hi']}
        listing={asListing(draft)}
        onClose={() => setSent(false)}
        {...rest}
        distinct={distinct}
        draft={draft}
        intent={intent}
        sender={sender}
        sent={sent}
        step={step}
        onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
        onDistinct={(ids) => setDistinct((current) => [...current, ...ids])}
        onIntent={(picked, at) => {
          setIntent(picked)
          setStep(at)
        }}
        onSender={(patch) => setSender((current) => ({ ...current, ...patch }))}
        onSent={() => setSent(true)}
        onStep={setStep}
      />
    </div>
  )
}

/** Each stage as its deep link opens it: the stages before it answered with the sample. */
const STAGES: { step: ListingStep; link: string }[] = [
  { step: 'where', link: '?step=place' },
  { step: 'when', link: '?step=time' },
  { step: 'details', link: '?step=details' },
  { step: 'review', link: '?step=check' },
]

const FIXES: { intent: FixIntent; step: ListingStep; link: string }[] = [
  { intent: 'when', step: 'when', link: '?fix=time' },
  { intent: 'where', step: 'where', link: '?fix=place' },
  { intent: 'details', step: 'details', link: '?fix=details' },
  { intent: 'nobody', step: 'note', link: '?fix=nobody' },
  { intent: 'stopped', step: 'note', link: '?fix=stopped' },
  { intent: 'other', step: 'note', link: '?fix=other' },
]

const correction = { eventId: 507, baseDraft: filled, event: { ...asListing(filled), id: 507 } }

/** A link's caption under its panel. */
function Caption({ children }: { children: string }) {
  return <code className="mt-1 block text-xs text-gray-11">{children}</code>
}

/**
 * ProposalForm is the add-a-class and correction flow (#147), guided: Place, Time, Details and
 * Check, in the stack's own sheet. A correction asks "what needs fixing?" first. Each panel here
 * holds its own draft, so the steps can be walked. Each is captioned with the deep link that
 * opens it in the app (`lib/proposal/deep-link.ts`).
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection
      description="Each stage as its deep link opens it on `…/add`: the stages before it answered with the sample (Balham Library, Thursdays)."
      title="Stages"
    >
      <div className="flex flex-wrap gap-4">
        {STAGES.map(({ step, link }) => (
          <div key={step}>
            <Panel initial={sampleDraft(empty, { step })} step={step} />
            <Caption>{link}</Caption>
          </div>
        ))}
      </div>
    </StorySection>

    <StorySection
      description="Where people sign up: on the class's page, or the host's own page such as Meetup, whose link goes right under the question."
      title="Sign-up on another site"
    >
      <Panel
        initial={sampleDraft(empty, { step: 'details', signup: 'elsewhere' })}
        step="details"
      />
      <Caption>?signup=elsewhere</Caption>
    </StorySection>

    <StorySection
      description="A class at the same place that also meets at the same time is named on Check, with a link to it. The same address on another day is not (the Stages' Check)."
      title="Possible duplicate"
    >
      <Panel duplicates={[balham]} initial={filled} step="review" />
      <Caption>?duplicate=939</Caption>
    </StorySection>

    <StorySection
      description="A correction opens on what needs fixing; each answer opens only the step that fixes it."
      title="Correction"
    >
      <div className="flex flex-wrap gap-4">
        <div>
          <Panel correction={correction} initial={filled} step="fix" />
          <Caption>…/correct</Caption>
        </div>
        {FIXES.map(({ intent, step, link }) => (
          <div key={intent}>
            <Panel
              correction={correction}
              initial={filled}
              intent={intent}
              nobodyOn={intent === 'nobody' ? '' : null}
              reported={intent === 'stopped'}
              step={step}
            />
            <Caption>{`…/correct${link}`}</Caption>
          </div>
        ))}
      </div>
    </StorySection>

    <StorySection
      description="An online class: a join link and a city, which places it in a region."
      title="Online"
    >
      <Panel initial={{ ...filled, eventType: 'online', address: null }} step="where" />
    </StorySection>

    <StorySection
      description="Each refusal the intake can return renders its own sentence. An unreachable captcha and an unreadable patch read as the generic send failure."
      title="Refused"
    >
      <div className="flex flex-wrap gap-4">
        {(
          [
            'captcha_failed',
            'invalid_email',
            'disposable_email',
            'urls_not_allowed',
            'unknown',
          ] as const
        ).map((code) => (
          <Panel key={code} initial={filled} initialRefusal={code} step="review" />
        ))}
      </div>
    </StorySection>

    <StorySection description="The receipt. Nothing reads the submission back." title="Submitted">
      <div className="flex flex-wrap gap-4">
        <Panel sent initial={filled} step="review" />
        <Panel sent initial={{ ...filled, address: null }} step="review" />
      </div>
    </StorySection>

    <StorySection
      description="A phone's bottom sheet (375px) and the desktop panel (352px)."
      title="Widths"
    >
      <div className="flex flex-wrap items-start gap-4">
        <Panel initial={filled} step="when" width={375} />
        <Panel initial={filled} step="when" width={352} />
      </div>
    </StorySection>
    <div />
  </StoryWrapper>
)
Default.storyName = 'Proposal Form'
