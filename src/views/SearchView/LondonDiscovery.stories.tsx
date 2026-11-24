import type { Story, StoryDefault } from '@ladle/react'

import { Discovery, type DiscoverySettings } from '../../../stories/london-discovery/Discovery'

export default { title: 'Views' } satisfies StoryDefault

export const LondonDiscovery: Story<DiscoverySettings> = (settings) => (
  <Discovery key={settings.place + settings.sample} {...settings} />
)

LondonDiscovery.storyName = 'London discovery'

// Older direct links to the fixtures still work from a phone or Simulator.
const query = new URLSearchParams(window.location.search)
const place = query.get('place')
const sample = query.get('sample')

LondonDiscovery.args = {
  place: place === 'prague' ? 'Prague' : place === 'canada' ? 'Canada' : 'London',
  sample: sample === 'two' || sample === 'one' ? sample : 'city',
  mapPreview: query.get('mobileMap') !== 'button',
  showBanner: query.get('banner') === '1',
}
LondonDiscovery.argTypes = {
  place: { name: 'Place', options: ['London', 'Canada', 'Prague'], control: { type: 'radio' } },
  sample: { name: 'London venues', options: ['city', 'two', 'one'], control: { type: 'select' } },
  mapPreview: { name: 'Mobile map preview', control: { type: 'boolean' } },
  showBanner: { name: 'Host banner', control: { type: 'boolean' } },
}
