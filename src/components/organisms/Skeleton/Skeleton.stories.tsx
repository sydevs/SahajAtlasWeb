import type { Story, StoryDefault } from '@ladle/react'
import type { SkeletonShape } from './Skeleton'

import { StoryWrapper, StorySection } from '../../ladle'

import { Skeleton, SkeletonBlock, SkeletonGroup, SkeletonLine } from './Skeleton'

export default { title: 'Organisms' } satisfies StoryDefault

const TEXT = ['text-xs', 'text-sm', 'text-base', 'text-lg', 'text-xl'] as const

const PANELS: { title: string; description: string; shape: SkeletonShape; cta?: boolean }[] = [
  {
    title: 'First screen',
    description: 'The search field and Filters, over place rows.',
    shape: { header: 'field', body: 'places' },
  },
  {
    title: 'Search results',
    description: 'The search field over Filters and Sort, then class cards.',
    shape: { header: 'search', body: 'classes' },
  },
  {
    title: 'A country or region',
    description: 'Back, the title, the search box under it, then its places.',
    shape: { header: 'titled-field', body: 'places' },
  },
  {
    title: 'A city, or online classes',
    description:
      'Back and the title (with the search box on a city), then class cards. Before the region tree arrives, the route guesses rows or cards by its depth.',
    shape: { header: 'titled-field', body: 'classes' },
  },
  {
    title: 'A class',
    description:
      'Back and the title, in the class page’s own header, then its chips, when and where, Register and its words. On the phone sheet Register pins to the foot, so the placeholder leaves it out.',
    shape: { header: 'class', body: 'class' },
    cta: true,
  },
]

/**
 * Skeleton — the loading panel: a few generic shapes every view draws while its data, or the
 * interface's code, is on its way. The boot panel draws a whole one before the code arrives; a
 * view loading inside the drawer keeps its real header (Back, Calendar and Filters work) over the
 * body. The calendar, the forms and the share sheet have none: their data is on hand when they
 * open, so their own header over a spinner stands for the moment their code takes.
 */
export const SkeletonStory: Story = () => (
  <StoryWrapper>
    {PANELS.map(({ title, description, shape, cta }) => (
      <StorySection key={title} description={description} title={title}>
        <div className="flex h-[560px] w-[352px] flex-col overflow-clip rounded-2xl border border-divider bg-background">
          <Skeleton cta={cta} shape={shape} />
        </div>
      </StorySection>
    ))}

    <StorySection
      description="The shapes the panel is built from. A line takes the text classes of the line it stands for, so it is exactly that line's height; each sits beside the text it stands in for. A block is any other shape, sized by the caller."
      title="Lines and blocks"
    >
      <div className="grid max-w-xl grid-cols-[auto_1fr_1fr] items-start gap-x-6 gap-y-2">
        {TEXT.map((size) => (
          <div key={size} className="contents">
            <code className="text-xs text-gray-11">{size}</code>
            <SkeletonGroup className="border-y border-dashed border-divider">
              <SkeletonLine className={size} width="w-3/4" />
            </SkeletonGroup>
            <div className={`border-y border-dashed border-divider ${size}`}>
              Evening meditation
            </div>
          </div>
        ))}
      </div>
      <SkeletonGroup className="mt-6 flex max-w-md items-center gap-3">
        <SkeletonBlock className="h-6 w-6 rounded-full" />
        <SkeletonBlock className="h-5 w-24" />
        <SkeletonBlock className="h-10 flex-1" />
      </SkeletonGroup>
    </StorySection>

    <div />
  </StoryWrapper>
)

SkeletonStory.storyName = 'Skeleton'
