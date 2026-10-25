import type { Story, StoryDefault } from '@ladle/react'
import type { ListingDraft, ListingStep } from '@/lib/proposal'
import type { SectionKey } from './sections'

import { useMemo, useState } from 'react'

// Not in the organisms barrel — it is reached only through the lazy submit view.
import { StorySection, StoryWrapper } from '../../ladle'

import { ListingEditor } from './ListingEditor'
import { SendForm } from './SendForm'

import { EMPTY_SENDER } from '@/config/store'
import { draftPreviewSchedule, emptyDraft, previewEvent } from '@/lib/proposal'

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
    label: '12 Church Road, Hove BN3 2FL, United Kingdom',
    street: '12 Church Road',
    postCode: 'BN3 2FL',
    city: 'Hove',
    country: 'GB',
    latitude: 50.8279,
    longitude: -0.1688,
    location: { placeId: 'dXJuOm1ieHBsYzpBUVRC' },
  },
  room: 'Upstairs hall',
  firstDate: '2026-11-03',
  startTime: '19:30',
  endTime: '20:30',
  repeats: 'weekly',
  contactName: 'Priya',
  contactPhone: '07700 900123',
  description: 'A gentle guided meditation for beginners. Free, no booking needed.',
}

/** A self-contained editor: the story owns the draft its view would hold in the store. */
function Editor({
  initial,
  base,
  open: opened = 'review',
}: {
  initial: ListingDraft
  base?: ListingDraft
  open?: ListingStep
}) {
  const [draft, setDraft] = useState(initial)
  const [open, setOpen] = useState<ListingStep>(opened)
  const [attempted, setAttempted] = useState<SectionKey[]>([])
  const listing = useMemo(
    () => previewEvent(draft, { path: '/add', schedule: draftPreviewSchedule(draft) }),
    [draft],
  )

  return (
    <div className="w-[352px] rounded-lg border border-divider bg-background">
      <ListingEditor
        attempted={attempted}
        base={base}
        draft={draft}
        languageOptions={['en', 'fr', 'de', 'hi']}
        listing={listing}
        open={open}
        onAttempt={(key) => setAttempted((current) => [...current, key])}
        onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
        onOpen={setOpen}
        onStopped={base ? () => {} : undefined}
      />
    </div>
  )
}

/**
 * ListingEditor is the add-a-class and correction surface (#147): the listing itself, editable
 * in place. Each part reads as the published class does, or as an invitation while empty, and
 * opens its editor where it sits. Each section here holds its own draft, so it can be used.
 */
export const ListingEditorStory: Story = () => (
  <StoryWrapper>
    <StorySection
      description="A new listing before anything is entered: invitations, Where and When required, nothing asserted."
      title="Empty"
    >
      <div className="flex flex-wrap items-start gap-4">
        <Editor initial={empty} />
        <Editor initial={empty} open="where" />
        <Editor initial={empty} open="when" />
      </div>
    </StorySection>

    <StorySection
      description="Filled in, every part reading as the published class does."
      title="Filled"
    >
      <div className="flex flex-wrap items-start gap-4">
        <Editor initial={filled} />
        <Editor initial={filled} open="when" />
        <Editor
          initial={{
            ...filled,
            eventType: 'online',
            address: null,
            onlineUrl: 'https://zoom.us/j/1',
            city: { label: 'Hove', city: 'Hove', location: {} },
          }}
        />
      </div>
    </StorySection>

    <StorySection
      description="A correction: the same surface prefilled, the changed part marked with Undo."
      title="Correction"
    >
      <Editor base={filled} initial={{ ...filled, startTime: '19:15' }} />
    </StorySection>

    <StorySection
      description="The send step: the visitor's own email, a note, the check."
      title="Send"
    >
      <div className="w-[352px] rounded-lg border border-divider bg-background">
        <SendStory />
      </div>
    </StorySection>
  </StoryWrapper>
)
ListingEditorStory.storyName = 'ListingEditor'

function SendStory() {
  const [sender, setSender] = useState(EMPTY_SENDER)

  return (
    <SendForm
      context={context}
      draft={filled}
      sender={sender}
      onInvalid={() => {}}
      onSender={(patch) => setSender((current) => ({ ...current, ...patch }))}
      onSent={() => {}}
    />
  )
}
