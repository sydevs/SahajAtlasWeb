import type { Story, StoryDefault } from '@ladle/react'

import { StorySection, StoryWrapper } from '../../ladle'
import { SortMenu } from '../SortMenu'

import { ListToolbar } from './ListToolbar'

import { Button } from '@/components/atoms/Button'
import { FilterIcon } from '@/components/atoms/Icons'

export default { title: 'Molecules' } satisfies StoryDefault

// A stand-in for the view-level FilterButton (which drives the drawer stack). The
// toolbar only lays its children out, so the story supplies a plain ghost button.
const FiltersButton = () => (
  <Button size="sm" variant="ghost">
    <FilterIcon size={18} />
    Filters
  </Button>
)

/**
 * ListToolbar — the controls row above a results list. A `justify-between` flex row:
 * the Filters button sits at the start, the optional SortMenu at the end. On the root
 * Countries list only the Filters button shows (sorting a country index has no
 * meaning); the search results add the SortMenu.
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection
      description="Search results: Filters at the start, Sort at the end."
      title="With sort (search results)"
    >
      <div className="w-full max-w-sm rounded-lg border border-divider">
        <ListToolbar>
          <FiltersButton />
          <SortMenu />
        </ListToolbar>
      </div>
    </StorySection>

    <StorySection
      description="Countries list: a single Filters button, left-aligned (no sort menu)."
      title="Filters only (countries)"
    >
      <div className="w-full max-w-sm rounded-lg border border-divider">
        <ListToolbar>
          <FiltersButton />
        </ListToolbar>
      </div>
    </StorySection>

    <div />
  </StoryWrapper>
)

Default.storyName = 'List Toolbar'
