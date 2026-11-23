import type { Story, StoryDefault } from '@ladle/react'

import { ClassPagePreview } from '../../../stories/class-page/ClassPagePreview'

export default { title: 'Views' } satisfies StoryDefault

export const ClassPage: Story = () => <ClassPagePreview />

ClassPage.storyName = 'Class page'
