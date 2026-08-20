import type { Story, StoryDefault } from '@ladle/react'
import type { QueryClient } from '@tanstack/react-query'
import type { CompactState } from '@/lib/compact-state'
import type { RegionListItem } from '@/types'

import { CompactView } from './CompactView'

import { CountriesView } from '@/views/CountriesView/CountriesView'
import { ViewHarness } from '@/views/story-harness'
import { mockCountries } from '@/mocks/regions'

export default { title: 'Views' } satisfies StoryDefault

const OVERLAY: CompactState = { action: { kind: 'overlay' }, autoOpen: false }
const LINK: CompactState = {
  action: { kind: 'link', href: 'https://wemeditate.com/map' },
  autoOpen: false,
}

/** The host's slot, so the view is seen in the kind of box it is rendered into. */
function Slot({
  width,
  height,
  children,
}: {
  width: number
  height?: number
  children: React.ReactNode
}) {
  return (
    <div
      className="border border-dashed border-divider"
      style={{ width, height, display: height ? 'block' : undefined }}
    >
      {children}
    </div>
  )
}

/** The REAL interface, seeded, so the dialog opens onto what the app actually renders. */
function Interface() {
  return (
    <ViewHarness
      seed={(client: QueryClient) =>
        client.setQueryData<RegionListItem[]>(['countries'], mockCountries)
      }
      seedKey="compact-view"
    >
      <CountriesView />
    </ViewHarness>
  )
}

/**
 * CompactView — what the widget IS in a slot too small for the interface (issue #161): a card
 * with one control, and the dialog that control opens.
 *
 * Its only variation is where the control goes, and that is `decideSlot`'s answer
 * (`lib/slot-decision.ts`) — measurement rather than configuration, specced in the node lane
 * rather than previewed here.
 *
 * The dialog contains the **real** `CountriesView`, seeded through `ViewHarness`, so the whole
 * path is reviewable without a backend rather than mocked at the last step.
 */
export const Default: Story = () => (
  <div className="flex flex-col gap-8 p-6">
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">Opens in place</h2>
      <p className="text-sm text-gray-11">
        Press the button: the dialog opens with the real country list inside, over a margin that
        shows this page behind. Escape steps outward, clicking the margin closes it, and focus
        returns to the button.
      </p>
      <Slot height={480} width={300}>
        <CompactView compact={OVERLAY}>
          <Interface />
        </CompactView>
      </Slot>
    </section>

    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">Leaves for somewhere that fits</h2>
      <p className="text-sm text-gray-11">
        A framed embed cannot grow — an overlay would only cover the frame — so the control is an
        anchor to a page that fits, opened in a new tab.
      </p>
      <Slot height={480} width={300}>
        <CompactView compact={LINK}>{null}</CompactView>
      </Slot>
    </section>

    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">The same card in every slot</h2>
      <p className="text-sm text-gray-11">
        Tall, short and unsized. It takes its content height in all three — filling would collapse
        it to invisible against an element with no height, and stretch it down 600px of empty
        background against a tall one.
      </p>
      <div className="flex flex-wrap items-start gap-6">
        <Slot height={420} width={280}>
          <CompactView compact={LINK}>{null}</CompactView>
        </Slot>
        <Slot height={140} width={280}>
          <CompactView compact={LINK}>{null}</CompactView>
        </Slot>
        <Slot width={280}>
          <CompactView compact={LINK}>{null}</CompactView>
        </Slot>
      </div>
    </section>
  </div>
)

Default.storyName = 'Compact'
