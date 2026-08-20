import type { Story, StoryDefault } from '@ladle/react'
import type { ReactNode } from 'react'

import { CompactCard } from './CompactCard'

import { ExpandedSurface } from '@/components/atoms/ExpandedSurface'
import { LocalExpansionProvider, useExpansion } from '@/hooks/use-expansion'

/**
 * The widget in a slot too small for the interface (issue #161) — a heading and one control
 * that opens the whole thing somewhere it fits.
 *
 * Each story puts the card in a box of a real, measured size, because how it sits in a host's
 * slot is the thing worth looking at.
 *
 * **The buttons work.** Every `overlay` story below is wired through the real `useExpansion`
 * seam and a real `ExpandedSurface`, so pressing one opens the surface exactly as it does in
 * the app — Esc steps out, the × collapses, focus returns to the button. An earlier version of
 * these stories passed `onOpen: () => {}` and the buttons did nothing, which made the one
 * interaction worth reviewing the one thing a reviewer could not see.
 */
export default {
  title: 'Organisms / CompactCard',
} satisfies StoryDefault

const Slot = ({
  width,
  height,
  children,
}: {
  width: number
  height?: number
  children: ReactNode
}) => (
  <div
    className="border border-dashed border-divider"
    style={{ width, height, display: height ? 'block' : undefined }}
  >
    {children}
  </div>
)

/** The card + the surface it opens, composed exactly as `AppShell` composes them. */
function Expandable({ fill }: { fill: boolean }) {
  const { expanded, expand, collapse } = useExpansion()

  return (
    <>
      <CompactCard action={{ kind: 'overlay', onOpen: expand }} fill={fill} />
      <ExpandedSurface
        collapseLabel="Close"
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
      </ExpandedSurface>
    </>
  )
}

const InSlot = ({ width, height }: { width: number; height?: number }) => (
  <LocalExpansionProvider>
    <Slot height={height} width={width}>
      <Expandable fill={height !== undefined} />
    </Slot>
  </LocalExpansionProvider>
)

/** The live reference shape: `sahajayoga.nl` embeds at a hard-coded 400×600. */
export const ReferenceSlot: Story = () => <InSlot height={600} width={400} />

/** A narrow sidebar, which is what the floors are set to catch. */
export const NarrowColumn: Story = () => <InSlot height={480} width={300} />

/**
 * A host who gave the element no height at all.
 *
 * `fill` is false here, and that is the point: `h-full` would resolve against nothing, the card
 * would collapse, and the host would see an embed that "did not render".
 */
export const NoHeightGiven: Story = () => <InSlot width={300} />

/** Short and wide, where an uncapped button would read as a broken layout rather than a card. */
export const ShortAndWide: Story = () => <InSlot height={300} width={900} />

/**
 * A framed embed, which cannot expand in place — an overlay would cover the same undersized
 * frame — so the control is an anchor to a page that fits, opened in a new tab.
 *
 * This is the one story whose button leaves rather than opens, and that difference is the
 * feature: `href` rather than `onClick` means middle-click and "open in new tab" work too.
 */
export const FramedFallback: Story = () => (
  <Slot height={600} width={400}>
    <CompactCard fill action={{ kind: 'link', href: 'https://wemeditate.com/map' }} />
  </Slot>
)
