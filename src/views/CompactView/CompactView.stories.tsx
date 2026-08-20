import type { Story, StoryDefault } from '@ladle/react'
import type { QueryClient } from '@tanstack/react-query'
import type { RegionListItem } from '@/types'

import { CompactView } from './CompactView'

import { Dialog } from '@/components/atoms/Dialog'
import { LocalExpansionProvider, useExpansion } from '@/hooks/use-expansion'
import { CountriesView } from '@/views/CountriesView/CountriesView'
import { ViewHarness } from '@/views/story-harness'
import { mockCountries } from '@/mocks/regions'

export default { title: 'Views' } satisfies StoryDefault

/** The host's slot, so the view is seen in the kind of box it is rendered into. */
function Slot({ width, height, children }: { width: number; height?: number; children: unknown }) {
  return (
    <div
      className="border border-dashed border-divider"
      style={{ width, height, display: height ? 'block' : undefined }}
    >
      {children as never}
    </div>
  )
}

/**
 * The real thing: the compact view, and the REAL `CountriesView` in the dialog it opens.
 *
 * Everything below the dialog is the app's own composition — `ViewHarness` seeds the feed, the
 * region tree and the client record, then renders the same drawer stack `DrawerStack` does. So
 * this is the one place a reviewer can see the whole path end to end without a backend, and the
 * one place the interaction between a vaul drawer and the dialog's `contain: layout` is visible
 * rather than argued about.
 */
function Expandable() {
  const { expanded, expand, collapse } = useExpansion()

  return (
    <>
      <CompactView action={{ kind: 'overlay', onOpen: expand }} />
      <Dialog
        closeLabel="Close"
        open={expanded}
        title="Free meditation classes"
        onOpenChange={(next) => !next && collapse()}
      >
        <ViewHarness
          seed={(client: QueryClient) =>
            client.setQueryData<RegionListItem[]>(['countries'], mockCountries)
          }
          seedKey="compact-view"
        >
          <CountriesView />
        </ViewHarness>
      </Dialog>
    </>
  )
}

/**
 * CompactView — what the widget is in a slot too small for the interface (issue #161).
 *
 * A heading and one control. Which control is the view's only variation: **`overlay`** opens the
 * interface in place, **`link`** leaves for a page that fits, and that choice is `decideSlot`'s
 * (`lib/slot-decision.ts`) — measurement rather than configuration, specced in the node lane
 * rather than previewed here.
 *
 * It never fills its slot: it takes the height its content needs, in whatever box the host gave,
 * which is why the three sizes below all render the same card.
 */
export const Default: Story = () => (
  <div className="flex flex-col gap-8 p-6">
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">Opens in place</h2>
      <p className="text-sm text-gray-11">
        Press the button: the dialog opens with the real country list inside it, over a margin that
        shows this page behind. Escape steps outward, clicking the margin closes it, and focus
        returns to the button.
      </p>
      <LocalExpansionProvider>
        <Slot height={480} width={300}>
          <Expandable />
        </Slot>
      </LocalExpansionProvider>
    </section>

    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">Leaves for somewhere that fits</h2>
      <p className="text-sm text-gray-11">
        A framed embed cannot grow — an overlay would only cover the frame — so the control is an
        anchor to a page that fits, opened in a new tab.
      </p>
      <Slot height={480} width={300}>
        <CompactView action={{ kind: 'link', href: 'https://wemeditate.com/map' }} />
      </Slot>
    </section>

    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">The same card in every slot</h2>
      <p className="text-sm text-gray-11">
        Tall, short and unsized. It takes its content height in all three — filling is wrong in both
        directions: against an element with no height it would collapse to invisible, and against a
        tall one it would stretch a two-line card down 600px of empty background.
      </p>
      <div className="flex flex-wrap items-start gap-6">
        <Slot height={420} width={280}>
          <CompactView action={{ kind: 'overlay', onOpen: () => {} }} />
        </Slot>
        <Slot height={140} width={280}>
          <CompactView action={{ kind: 'overlay', onOpen: () => {} }} />
        </Slot>
        <Slot width={280}>
          <CompactView action={{ kind: 'overlay', onOpen: () => {} }} />
        </Slot>
      </div>
    </section>
  </div>
)

Default.storyName = 'Compact'
