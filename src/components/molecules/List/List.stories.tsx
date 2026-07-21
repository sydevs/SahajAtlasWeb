import type { Story, StoryDefault } from '@ladle/react'

import { StoryWrapper, StorySection } from '../../ladle'

import { List } from './List'

import { ListItem } from '@/components/molecules/ListItem'

export default { title: 'Molecules / List' } satisfies StoryDefault

/**
 * List — a scroll-shadowed `<ul>` container for ListItem / EventListItem rows, as
 * used inside the RegionView drawer body.
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection title="Basic">
      <div className="max-w-md">
        <List>
          <ListItem count={12} href="#area" label="Cambridge" />
          <ListItem count={7} href="#area" label="Oxford" />
          <ListItem count={3} href="#area" label="London" />
        </List>
      </div>
    </StorySection>

    <StorySection title="With Subtitles">
      <div className="max-w-md">
        <List>
          <ListItem count={12} href="#area" label="Cambridge" subtitle="Cambridgeshire" />
          <ListItem count={7} href="#area" label="Oxford" subtitle="Oxfordshire" />
        </List>
      </div>
    </StorySection>

    <div />
  </StoryWrapper>
)

Default.storyName = 'List'
