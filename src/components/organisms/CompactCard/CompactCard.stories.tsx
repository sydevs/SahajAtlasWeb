import type { Story, StoryDefault } from '@ladle/react'
import type { ReactNode } from 'react'

import { StorySection, StoryWrapper } from '../../ladle'

import { CompactCard } from './CompactCard'

import { Dialog } from '@/components/atoms/Dialog'
import { LocalExpansionProvider, useExpansion } from '@/hooks/use-expansion'

export default { title: 'Organisms' } satisfies StoryDefault

/** A host slot, so each variation is seen in the kind of box it is sized against. */
function Slot({
  width,
  height,
  children,
}: {
  width: number
  height?: number
  children: ReactNode
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

/** The card wired to a real surface, so the `overlay` action does what it does in the app. */
function Live({ fill }: { fill: boolean }) {
  const { expanded, expand, collapse } = useExpansion()

  return (
    <>
      <CompactCard action={{ kind: 'overlay', onOpen: expand }} fill={fill} />
      <Dialog
        closeLabel="Close"
        open={expanded}
        title="Free meditation classes"
        onOpenChange={(next) => !next && collapse()}
      >
        <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
          <p className="text-lg font-semibold">The whole interface goes here.</p>
          <p className="max-w-sm text-sm text-gray-11">
            In the app this is the map and the drawer stack, which React never renders until this
            surface opens — that is what keeps mapbox-gl unfetched behind a compact embed.
          </p>
        </div>
      </Dialog>
    </>
  )
}

/**
 * CompactCard — what the widget shows in a slot too small for the interface (issue #161).
 *
 * The card takes exactly two props, and the sections below are those two props rather than a
 * tour of the places it appears: **`action`** (where the button goes) and **`fill`** (whether
 * the host gave the element a height). Which of them applies in a given embed is decided by
 * `decideSlot` (`lib/slot-decision.ts`), which is measurement rather than configuration and so
 * is specced in the node lane, not previewed here.
 *
 * The `overlay` sections are wired to a real `Dialog` through the real `useExpansion`
 * seam, so the buttons work: press one and the surface opens, Escape steps out, the × collapses
 * and focus returns to the button.
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection
      description="`action.kind: 'overlay'` — the widget can grow where it is, so the button opens the interface in place. Press it."
      title="Opens in place"
    >
      <LocalExpansionProvider>
        <Slot height={480} width={300}>
          <Live fill />
        </Slot>
      </LocalExpansionProvider>
    </StorySection>

    <StorySection
      description="`action.kind: 'link'` — inside a frame there is nowhere bigger to grow, so the control is an anchor to a page that fits, opened in a new tab. An anchor rather than a button so middle-click and 'open in new tab' work too."
      title="Leaves for somewhere that fits"
    >
      <Slot height={480} width={300}>
        <CompactCard fill action={{ kind: 'link', href: 'https://wemeditate.com/map' }} />
      </Slot>
    </StorySection>

    <StorySection
      description="`fill: true` fills a box the host sized; `fill: false` takes only the height the content needs. The second is what an element with no height of its own gets — `h-full` would resolve against nothing and the card would collapse, so the host would see an embed that did not render."
      title="fill"
    >
      <div className="flex flex-wrap items-start gap-6">
        <LocalExpansionProvider>
          <Slot height={320} width={280}>
            <Live fill />
          </Slot>
        </LocalExpansionProvider>
        <LocalExpansionProvider>
          <Slot width={280}>
            <Live fill={false} />
          </Slot>
        </LocalExpansionProvider>
      </div>
    </StorySection>

    <StorySection
      inContext
      description="The content is capped at max-w-xs and centred, so a short wide slot reads as a card rather than one button stretched across a thousand pixels."
      title="A short, wide slot"
    >
      <LocalExpansionProvider>
        <Slot height={220} width={900}>
          <Live fill />
        </Slot>
      </LocalExpansionProvider>
    </StorySection>
  </StoryWrapper>
)

Default.storyName = 'Compact Card'
