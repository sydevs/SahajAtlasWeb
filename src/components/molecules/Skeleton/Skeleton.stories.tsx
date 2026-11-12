import type { Story, StoryDefault } from '@ladle/react'

import { StorySection, StoryWrapper } from '../../ladle'

import { EventSkeleton, FieldSkeleton, ListSkeleton, TitleSkeleton } from './Skeleton'

export default { title: 'Molecules' } satisfies StoryDefault

/**
 * Skeleton — the placeholder shapes the loading states draw, each shaped like what it stands in
 * for. The boot panel (before the interface's code arrives) and the drawer's loading chrome
 * compose them, so a load goes boot panel, loading sheet, content without changing shape.
 * Toggle the theme to check the bars in dark mode.
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection
      description="The first screen: its title, the field and the country list."
      title="First screen"
    >
      <div className="max-w-sm overflow-hidden rounded-lg border border-divider bg-background">
        <div className="px-gutter pt-4 pb-2">
          <TitleSkeleton />
        </div>
        <FieldSkeleton prompt className="mx-gutter mb-2" />
        <ListSkeleton icons rows={6} />
      </div>
    </StorySection>

    <StorySection description="A place: Back, its name, the field, then its list." title="Place">
      <div className="max-w-sm overflow-hidden rounded-lg border border-divider bg-background">
        <div className="px-gutter pt-4 pb-2">
          <TitleSkeleton back />
        </div>
        <FieldSkeleton className="mx-gutter mb-2" />
        <ListSkeleton />
      </div>
    </StorySection>

    <StorySection description="Online classes or results: class cards." title="Classes">
      <div className="max-w-sm overflow-hidden rounded-lg border border-divider bg-background">
        <ListSkeleton rows={3} variant="classes" />
      </div>
    </StorySection>

    <StorySection
      description="A class: tags, when and where, Register and actions. On the phone sheet the real Register pins to the foot, so `actions` is off there."
      title="Class"
    >
      <div className="flex flex-wrap gap-6">
        <div className="w-80 overflow-hidden rounded-lg border border-divider bg-background">
          <div className="px-gutter pt-4 pb-2">
            <TitleSkeleton back lines={2} />
          </div>
          <EventSkeleton />
        </div>
        <div className="w-80 overflow-hidden rounded-lg border border-divider bg-background">
          <div className="px-gutter pt-4 pb-2">
            <TitleSkeleton back lines={2} />
          </div>
          <EventSkeleton actions={false} />
        </div>
      </div>
    </StorySection>

    <div />
  </StoryWrapper>
)

Default.storyName = 'Skeleton'
