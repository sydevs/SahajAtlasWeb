import type { Story, StoryDefault } from '@ladle/react'

import { AddClassEntry } from './AddClassEntry'

export default { title: 'Molecules / AddClassEntry' } satisfies StoryDefault

export const Default: Story = () => (
  <AddClassEntry
    hint="Our admins check it before it appears."
    href="/add"
    label="Run a class in London? Add it to the map"
  />
)
