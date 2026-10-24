import type { Story, StoryDefault } from '@ladle/react'
import type { ListingDraft, ListingStep } from '@/lib/proposal'
import type { ProposalFormProps } from './ProposalForm'

import { useState } from 'react'

// Not in the organisms barrel — it is reached only through the lazy submit views.
import { StorySection, StoryWrapper } from '../../ladle'

import { ProposalForm } from './ProposalForm'

import { emptyDraft } from '@/lib/proposal'

export default { title: 'Organisms' } satisfies StoryDefault

const context = {
  path: '/add',
  pageUrl: 'https://host.example/classes',
  locale: 'en',
  userAgent: 'Ladle',
}

const empty = emptyDraft('Europe/London', ['en'])

const filled: ListingDraft = {
  ...empty,
  address: {
    mapboxId: 'dXJuOm1ieGFkcjoxMjM0',
    label: '10 Downing Street, London SW1A 2AA, United Kingdom',
    street: '10 Downing Street',
    postCode: 'SW1A 2AA',
    city: 'London',
    country: 'GB',
    latitude: 51.5034,
    longitude: -0.1276,
    location: { placeId: 'dXJuOm1ieHBsYzpBUVRC' },
  },
  room: 'Main hall',
  firstDate: '2026-11-03',
  startTime: '19:00',
  endTime: '20:30',
  repeats: 'weekly',
  contactName: 'Ada',
  contactPhone: '+44 20 7946 0000',
  contactEmail: 'ada@example.org',
  description: 'A free guided meditation. Bring a shawl.',
  title: 'Tuesday evening meditation',
  website: 'https://example.org',
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

  return (
    <div className="rounded-lg border border-divider bg-background" style={{ width }}>
      <ProposalForm
        context={context}
        languageOptions={['en', 'fr', 'de', 'hi']}
        onClose={() => setSent(false)}
        {...rest}
        draft={draft}
        sent={sent}
        step={step}
        onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
        onSent={() => setSent(true)}
        onStep={setStep}
      />
    </div>
  )
}

const STEPS: ListingStep[] = ['where', 'when', 'contact', 'about', 'review', 'more']

/**
 * ProposalForm is the add-a-class and correction panel (#147): Where, When, Contact, About and
 * Review, plus the optional details step off Review. In the app it sits in its own sheet beside
 * the live listing — from the right on a wide widget, rising from the bottom on a narrow one —
 * and shrinks to the review bar on step 5. Each section here holds its own draft, so the steps
 * can be walked.
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection
      description="Every step of a new listing, before anything is entered. Contact and About carry Skip."
      title="Empty"
    >
      <div className="flex flex-wrap gap-4">
        {STEPS.map((step) => (
          <Panel key={step} initial={empty} step={step} />
        ))}
      </div>
    </StorySection>

    <StorySection description="The same steps, filled in." title="Filled">
      <div className="flex flex-wrap gap-4">
        {STEPS.map((step) => (
          <Panel key={step} initial={filled} step={step} />
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
      description="A correction opens on review, prefilled from the published class."
      title="Correction"
    >
      <Panel correction={{ eventId: 507, baseDraft: filled }} initial={filled} step="review" />
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
      description="A phone's bottom sheet (375px) and the desktop right panel (352px)."
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
