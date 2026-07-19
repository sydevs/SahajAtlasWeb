import type { Story, StoryDefault } from '@ladle/react'

import { StoryWrapper, StorySection } from '../../ladle'

import { OnlineClassesCard } from './OnlineClassesCard'

import { List } from '@/components/molecules/List'

export default { title: 'Molecules / List' } satisfies StoryDefault

/**
 * OnlineClassesCard — the shared entry into online classes (MonitorIcon + count),
 * used atop a region view and the country list. Only `count`/`href` vary.
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection inContext={true} title="Online Classes card">
      <div className="max-w-md overflow-hidden rounded-lg border border-divider">
        <List>
          <OnlineClassesCard count={28} href="#online" />
        </List>
      </div>
    </StorySection>

    <div />
  </StoryWrapper>
)

Default.storyName = 'Online Classes Card'
