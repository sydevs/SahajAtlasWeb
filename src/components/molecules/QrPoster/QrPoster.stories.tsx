import type { Story, StoryDefault } from '@ladle/react'

import { QrPoster } from './QrPoster'

export default { title: 'Molecules / QrPoster' } satisfies StoryDefault

export const Default: Story = () => (
  <div className="w-80">
    <QrPoster label="Evening Meditation at The Hut" url="https://example.org/gb/london/711" />
  </div>
)
