import type { Story, StoryDefault } from '@ladle/react'
import type { PanelShape } from './PanelSkeleton'

import { FieldSkeleton, PanelSkeletonBody, PanelSkeletonHeader } from './PanelSkeleton'

import { StoryWrapper, StorySection } from '@/components/ladle'
import { RESULTS_BAND, drawer } from '@/components/atoms/Drawer/drawer-style'

export default { title: 'Views' } satisfies StoryDefault

const slots = drawer({ direction: 'left', mode: 'anchored' })

const CASES: { title: string; description: string; shape: PanelShape; cta?: boolean }[] = [
  {
    title: 'First screen and search results',
    description:
      'The search field over place rows (the first screen) or class cards (search results).',
    shape: { header: 'field', body: 'places' },
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
      'Back and the title, then its chips, when and where, Register and its words. On the phone sheet Register pins to the foot, so the placeholder leaves it out.',
    shape: { header: 'titled', body: 'class' },
    cta: true,
  },
]

/** A panel as the drawer frames it: its header band, the search band, then the body. */
function Panel({ shape, cta }: { shape: PanelShape; cta?: boolean }) {
  return (
    <div className="flex h-[560px] w-[352px] flex-col overflow-clip rounded-2xl border border-divider bg-background">
      <div
        className={slots.header({
          className: shape.header === 'field' ? undefined : 'flex-col items-stretch gap-0',
        })}
      >
        <PanelSkeletonHeader header={shape.header === 'field' ? 'field' : 'titled'} />
      </div>
      {shape.header === 'titled-field' && (
        <div className={slots.toolbar({ className: `${RESULTS_BAND} px-gutter pb-2` })}>
          <FieldSkeleton />
        </div>
      )}
      <div className={slots.body()}>
        <PanelSkeletonBody body={shape.body} cta={cta} />
      </div>
    </div>
  )
}

/**
 * Panel Skeleton — the few loading shapes every view draws while its data, or the interface's
 * code, is on its way. The boot panel draws header and body before the code arrives; a view
 * loading inside the drawer keeps its real header (Back, Calendar and Filters work) over the
 * body. The calendar, the forms and the share sheet have no shape: their data is on hand when
 * they open, so their own header over a spinner stands for the moment their code takes.
 */
export const PanelSkeleton: Story = () => (
  <StoryWrapper>
    {CASES.map(({ title, description, shape, cta }) => (
      <StorySection key={title} description={description} title={title}>
        <Panel cta={cta} shape={shape} />
      </StorySection>
    ))}

    <div />
  </StoryWrapper>
)

PanelSkeleton.storyName = 'Panel Skeleton'
