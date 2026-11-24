import type { Story, StoryDefault } from '@ladle/react'

import {
  ClassPage as ClassPageView,
  type ClassExample,
} from '../../../stories/class-page/ClassPage'
import { classPageExamples } from '../../../stories/class-page/fixture'

import { LOADING, NO_ERROR, stateControl } from '@/views/story-harness'

export default { title: 'Views' } satisfies StoryDefault

export const ClassPage: Story<
  Omit<ClassExample, 'banner'> & { banner: 'off' | 'short' | 'tall' }
> = ({ banner, ...settings }) => (
  <div className="relative h-dvh min-w-0 [contain:layout]">
    <ClassPageView {...settings} banner={banner === 'off' ? undefined : banner} />
  </div>
)

ClassPage.storyName = 'Class page'

// Older standalone and Simulator links used these parameters before Ladle owned the controls.
const query = new URLSearchParams(window.location.search)
const direct = query.get('screen') === 'class' ? query : undefined
const banner = direct ? direct.get('banner') : 'short'
const height = banner === '1' ? 'short' : banner

ClassPage.args = {
  example: 'In person',
  state: NO_ERROR,
  banner: height === 'short' || height === 'tall' ? height : 'off',
  showCalendar: direct?.get('calendar') !== '0',
  showPhotos: direct?.get('photos') !== '0',
  shortDescription: direct?.get('description') === 'short',
}

ClassPage.argTypes = {
  example: { name: 'Example', options: Object.keys(classPageExamples), control: { type: 'radio' } },
  state: stateControl(LOADING, 'Not found · event'),
  banner: { name: 'Host banner', options: ['off', 'short', 'tall'], control: { type: 'select' } },
  showCalendar: { name: 'Show Add to Calendar', control: { type: 'boolean' } },
  showPhotos: { name: 'Show class photos', control: { type: 'boolean' } },
  shortDescription: { name: 'Short description', control: { type: 'boolean' } },
}
