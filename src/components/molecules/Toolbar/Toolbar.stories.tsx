import type { Story, StoryDefault } from '@ladle/react'

import { StoryWrapper, StorySection } from '../../ladle'

import { Toolbar } from './Toolbar'

export default { title: 'Molecules' } satisfies StoryDefault

/**
 * Toolbar — the drawer footer bar: a small Sahaj Atlas wordmark/attribution plus
 * the language selector and theme switch. Rendered in every drawer's footer slot.
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection title="Default">
      <Toolbar />
    </StorySection>

    <StorySection description="As it sits at the foot of a drawer." title="In a drawer footer">
      <div className="max-w-sm overflow-hidden rounded-lg border border-divider">
        <div className="p-6 text-sm text-gray-11">Drawer content sits above the toolbar.</div>
        <Toolbar className="border-t border-divider" />
      </div>
    </StorySection>

    <div />
  </StoryWrapper>
)

Default.storyName = 'Toolbar'
