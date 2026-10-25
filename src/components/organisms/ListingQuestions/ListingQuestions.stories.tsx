import type { Story, StoryDefault } from '@ladle/react'
import type { ListingDraft } from '@/lib/proposal'
import type { CorrectionReason, Question } from '@/lib/questions'
import type { ListingQuestionsProps } from './ListingQuestions'

import { useState } from 'react'

// Not in the organisms barrel — it is reached only through the lazy submit view.
import { StorySection, StoryWrapper } from '../../ladle'

import { ListingQuestions } from './ListingQuestions'

import { EMPTY_SENDER } from '@/config/store'
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
    label: '12 Church Road, Hove, BN3 2FL, United Kingdom',
    street: '12 Church Road',
    city: 'Hove',
    country: 'GB',
    latitude: 50.8279,
    longitude: -0.1688,
    location: { placeId: 'dXJuOm1ieHBsYzpBUVRC' },
  },
  firstDate: '2026-11-03',
  startTime: '19:30',
  endTime: '20:30',
  repeats: 'weekly',
  contactName: 'Elizabeth',
  description: 'A gentle guided meditation for beginners.',
}

/** A self-contained flow: the story owns the draft its view would hold in the store. */
function Flow({
  initial,
  question: initialQuestion,
  correction,
}: Pick<ListingQuestionsProps, 'correction'> & { initial: ListingDraft; question: Question }) {
  const [draft, setDraft] = useState(initial)
  const [question, setQuestion] = useState(initialQuestion)
  const [reason, setReason] = useState<CorrectionReason | null>(null)
  const [answered, setAnswered] = useState<Question[]>([])
  const [sent, setSent] = useState(false)
  const [sender, setSender] = useState(EMPTY_SENDER)

  return (
    <div className="flex h-[640px] w-[352px] flex-col rounded-lg border border-divider bg-background">
      <ListingQuestions
        answered={answered}
        context={context}
        correction={correction}
        draft={draft}
        languageOptions={['en', 'fr', 'de', 'hi']}
        question={question}
        reason={reason}
        review={<p className="text-sm text-gray-11">The listing preview renders here.</p>}
        reviewed={false}
        sender={sender}
        sent={sent}
        onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
        onClose={() => setSent(false)}
        onQuestion={(next, forward = true) => {
          if (forward) setAnswered((current) => [...current, question])
          setQuestion(next)
        }}
        onReason={setReason}
        onSender={(patch) => setSender((current) => ({ ...current, ...patch }))}
        onSent={() => setSent(true)}
      />
    </div>
  )
}

/**
 * ListingQuestions is the add-a-class and correction flow (#147), one question per screen: a
 * tap answers and slides the next question in; the last screen shows the listing the answers
 * build. Each section here holds its own draft, so the questions can be walked freely.
 */
export const ListingQuestionsStory: Story = () => (
  <StoryWrapper>
    <StorySection title="Add — first question">
      <Flow initial={empty} question="mode" />
    </StorySection>
    <StorySection title="Add — a place picked">
      <Flow initial={filled} question="place" />
    </StorySection>
    <StorySection title="Add — the time">
      <Flow initial={filled} question="time" />
    </StorySection>
    <StorySection title="Correct — what's changed?">
      <Flow
        correction={{ eventId: 507, baseDraft: filled, title: 'Tuesday evening meditation' }}
        initial={filled}
        question="changed"
      />
    </StorySection>
  </StoryWrapper>
)

ListingQuestionsStory.storyName = 'ListingQuestions'
