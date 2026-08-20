import type { Story, StoryDefault } from '@ladle/react'

import { CompactCard } from './CompactCard'

/**
 * The widget in a slot too small for the interface (issue #161) — a heading and one control
 * that opens the whole thing somewhere it fits.
 *
 * Each story wraps the card in a box of a real, measured size, because the thing worth looking
 * at is how it sits in a host's slot rather than the card in isolation.
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
  children: React.ReactNode
}) => (
  <div
    className="border border-dashed border-divider"
    style={{ width, height, display: height ? 'block' : undefined }}
  >
    {children}
  </div>
)

/** The live reference shape: `sahajayoga.nl` embeds at a hard-coded 400×600. */
export const ReferenceSlot: Story = () => (
  <Slot height={600} width={400}>
    <CompactCard fill action={{ kind: 'overlay', onOpen: () => {} }} />
  </Slot>
)

/** A narrow sidebar, which is what the floors are set to catch. */
export const NarrowColumn: Story = () => (
  <Slot height={480} width={300}>
    <CompactCard fill action={{ kind: 'overlay', onOpen: () => {} }} />
  </Slot>
)

/**
 * A host who gave the element no height at all.
 *
 * `fill` is false here, and that is the whole point: `h-full` would resolve against nothing,
 * the card would collapse, and the host would see an embed that "did not render".
 */
export const NoHeightGiven: Story = () => (
  <Slot width={300}>
    <CompactCard action={{ kind: 'overlay', onOpen: () => {} }} fill={false} />
  </Slot>
)

/**
 * A framed embed, which cannot expand in place — the overlay would cover the same undersized
 * frame — so the control is an anchor to a page that fits.
 */
export const FramedFallback: Story = () => (
  <Slot height={600} width={400}>
    <CompactCard fill action={{ kind: 'link', href: 'https://wemeditate.com/map' }} />
  </Slot>
)

/** Short and wide, where an uncapped button would read as a broken layout rather than a card. */
export const ShortAndWide: Story = () => (
  <Slot height={300} width={900}>
    <CompactCard fill action={{ kind: 'overlay', onOpen: () => {} }} />
  </Slot>
)
