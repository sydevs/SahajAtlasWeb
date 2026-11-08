import type { Story, StoryDefault } from '@ladle/react'

import { Check, ChevronRight, Languages } from 'lucide-react'

import { StorySection, StoryWrapper } from '../../ladle'

import { menuChrome } from './Menu'

export default { title: 'Atoms' } satisfies StoryDefault

const inline = menuChrome()
const stacked = menuChrome({ rows: 'stacked' })
const withSubmenus = menuChrome({ submenus: true })

/**
 * Menu — the skin the three Radix dropdown menus share, as a recipe rather than a component
 * (SortMenu, SettingsMenu and AddToCalendar each compose the primitive themselves). The live
 * menus have their own stories; this one opens all three variants at once, which is the only way
 * to see an unintended difference between them. The second row of each panel carries
 * `data-highlighted`, so the hover tint shows without a pointer.
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection
      background="neutral"
      description="Every panel below is one call to the recipe. The variants carry the width with the row layout, since a stacked row needs both."
      title="Menu chrome"
    >
      <div className="flex flex-wrap items-start gap-6">
        <figure className="flex flex-col gap-2">
          <figcaption className="text-xs text-gray-11">menuChrome() — the sort menu</figcaption>
          <div className={inline.surface()}>
            <div className={inline.row()}>
              <span className="flex w-4 shrink-0 justify-center">
                <Check className="text-primary" size={16} />
              </span>
              <span>Recommended</span>
            </div>
            <div className={inline.row()} data-highlighted="">
              <span className="w-4 shrink-0" />
              <span>Closest</span>
            </div>
          </div>
        </figure>

        <figure className="flex flex-col gap-2">
          <figcaption className="text-xs text-gray-11">
            rows: &apos;stacked&apos; — add to calendar
          </figcaption>
          <div className={stacked.surface()}>
            <div className={stacked.row()}>
              <span>Google Calendar</span>
            </div>
            <div className={stacked.row()} data-highlighted="">
              <span>Download .ics</span>
              <span className="text-xs text-gray-11">Apple Calendar and everything else</span>
            </div>
          </div>
        </figure>

        <figure className="flex flex-col gap-2">
          <figcaption className="text-xs text-gray-11">submenus — the cog</figcaption>
          <div className={withSubmenus.surface()}>
            <div className={withSubmenus.row()}>
              <Languages size={16} />
              <span>Language</span>
              <ChevronRight className="ms-auto rtl:-scale-x-100" size={16} />
            </div>
            <div className={withSubmenus.row()} data-state="open">
              <Languages size={16} />
              <span>Nederlands</span>
              <ChevronRight className="ms-auto rtl:-scale-x-100" size={16} />
            </div>
          </div>
        </figure>
      </div>
    </StorySection>

    <div />
  </StoryWrapper>
)

Default.storyName = 'Menu Chrome'
