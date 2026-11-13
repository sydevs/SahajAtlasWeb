import type { Story, StoryDefault } from '@ladle/react'

import { DrawerLoading } from '@/views/fallbacks'
import { ViewHarness } from '@/views/story-harness'

export default { title: 'Views' } satisfies StoryDefault

// Each address the loading placeholder takes a shape for, in the harness's seeded region tree.
const SHAPES = {
  'First screen': '/',
  'A country': '/gb',
  'Another country': '/de',
  'A region (places)': '/gb/cambridgeshire',
  'A city (classes)': '/gb/cambridgeshire/cambridge',
  'A class': '/gb/cambridgeshire/cambridge/101',
} as const

type ShapeKey = keyof typeof SHAPES

/**
 * Loading — what a view draws while its data is on its way (`DrawerLoading`): the view's own
 * header (CountriesView's, RegionView's, EventView's), with placeholder lines where its name or
 * title will go, then its content as skeletons shaped like what is coming: the first screen's
 * field and flagged rows, a place's place rows or class cards, a class's page. A country's field
 * carries the location line only when the page will show one (the harness seeds an IP guess in
 * Cambridge, so Germany's page offers it and the UK's, already the answer, does not). Pick a
 * shape to compare it with the loaded view's story.
 */
export const Loading: Story<{ shape: ShapeKey }> = ({ shape }) => (
  <ViewHarness path={SHAPES[shape]} seedKey={shape}>
    <DrawerLoading />
  </ViewHarness>
)

Loading.storyName = 'Loading'
Loading.meta = { width: 'xsmall' }
Loading.args = { shape: 'A city (classes)' }
Loading.argTypes = {
  shape: {
    name: 'Shape',
    options: Object.keys(SHAPES),
    control: { type: 'radio' },
    defaultValue: 'A city (classes)',
  },
}
