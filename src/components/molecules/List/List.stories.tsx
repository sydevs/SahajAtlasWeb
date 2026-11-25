import type { Story, StoryDefault } from '@ladle/react'

import { StoryWrapper, StorySection } from '../../ladle'

import { List, ListRow, ListRowSkeleton } from './List'

import { Skeleton, SkeletonLine } from '@/components/atoms/Skeleton'
import { ListItem } from '@/components/molecules/ListItem'

export default { title: 'Molecules / List' } satisfies StoryDefault

/**
 * List — a scroll-shadowed `<ul>` container for ListItem or EventListItem
 * rows, as used inside the RegionView drawer body.
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

    <StorySection
      description="ListRow is the shell every list row renders its content into: the li and its link, the gutter, the hover and press feedback, and the trailing chevron. ListItem and EventListItem both render into it, so the two row kinds cannot drift apart."
      title="ListRow"
    >
      <div className="max-w-md overflow-hidden rounded-lg border border-divider">
        <List>
          <ListRow className="min-h-14 py-3" href="#row">
            <div className="flex-grow text-lg">Any content</div>
          </ListRow>
          <ListRow className="py-4" href="#row">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="text-lg">A taller row</div>
              <div className="text-sm text-gray-11">
                Its content stacks; the chevron stays centred.
              </div>
            </div>
          </ListRow>
        </List>
      </div>
    </StorySection>

    <StorySection
      description="ListRowSkeleton is the same row before its content is known: the same box, gutter and chevron, with no link and no hover or press feedback. A row's skeleton renders its placeholders into it, as the row renders into ListRow. The real rows sit beside it."
      title="ListRowSkeleton"
    >
      <div className="grid max-w-3xl gap-4 md:grid-cols-2">
        <Skeleton className="overflow-hidden rounded-lg border border-divider">
          <List>
            <ListRowSkeleton className="min-h-14 py-3">
              <SkeletonLine className="flex-grow text-lg" width="w-1/3" />
            </ListRowSkeleton>
            <ListRowSkeleton className="py-4">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <SkeletonLine className="text-lg" width="w-2/5" />
                <SkeletonLine className="text-sm" width="w-4/5" />
              </div>
            </ListRowSkeleton>
          </List>
        </Skeleton>
        <div className="overflow-hidden rounded-lg border border-divider">
          <List>
            <ListRow className="min-h-14 py-3" href="#row">
              <div className="flex-grow text-lg">Any content</div>
            </ListRow>
            <ListRow className="py-4" href="#row">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="text-lg">A taller row</div>
                <div className="text-sm text-gray-11">
                  Its content stacks; the chevron stays centred.
                </div>
              </div>
            </ListRow>
          </List>
        </div>
      </div>
    </StorySection>

    <div />
  </StoryWrapper>
)

Default.storyName = 'List'
