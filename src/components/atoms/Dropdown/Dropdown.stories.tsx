import type { Story, StoryDefault } from '@ladle/react'

import { StoryWrapper, StorySection } from '../../ladle'
import { Checkbox } from '../Checkbox'

import { Dropdown } from './Dropdown'

import { LocationIcon, DownArrowIcon } from '@/components/atoms/Icons'

export default {
  title: 'Atoms',
} satisfies StoryDefault

const sizes = ['sm', 'md', 'lg'] as const

// A plain styled trigger. The Dropdown wrapper makes it the focusable
// `role="button"`, so the trigger itself must not be an interactive element
// (nesting a real <button> inside would give two focus stops for one control).
const triggerClass =
  'inline-flex cursor-pointer items-center gap-2 rounded-md border border-gray-7 px-4 py-2 text-sm font-medium text-foreground'

/**
 * Dropdown — a portaled popover shell with viewport-aware placement (flip/shift)
 * built on Floating UI. It frames arbitrary content and takes its ARIA role from
 * `role`; menus with submenus/radio groups use `@radix-ui/react-dropdown-menu`
 * instead (see SettingsMenu). Panel chrome uses the Radix semantic tokens, so it
 * follows light/dark + the accent theme.
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection description="Panel min-width scales with the size prop." title="Sizes">
      <div className="flex flex-wrap gap-4">
        {sizes.map((size) => (
          <StorySection key={size} title={size} variant="subsection">
            <Dropdown
              size={size}
              trigger={
                <span className={triggerClass}>
                  {size}
                  <DownArrowIcon size={16} />
                </span>
              }
            >
              <div className="p-3 text-sm text-foreground">Panel content ({size})</div>
            </Dropdown>
          </StorySection>
        ))}
      </div>
    </StorySection>

    <StorySection
      description="The panel opens on side and flips/shifts to stay on screen. Portaled, so it is never clipped by an overflow ancestor."
      title="Placement"
    >
      <div className="flex flex-wrap gap-6">
        {(['bottom', 'top', 'left', 'right'] as const).map((side) => (
          <StorySection key={side} title={`side="${side}"`} variant="subsection">
            <Dropdown
              align="center"
              side={side}
              trigger={<span className={triggerClass}>Open {side}</span>}
            >
              <div className="p-3 text-sm text-foreground">Opens {side}</div>
            </Dropdown>
          </StorySection>
        ))}
      </div>
    </StorySection>

    <StorySection
      description="`role` drives the ARIA contract. A rich content panel is a dialog and should carry an `ariaLabel` so it is announced."
      title="Roles"
    >
      <div className="flex flex-wrap gap-4">
        <Dropdown
          aria-label="Filters"
          role="dialog"
          trigger={<span className={triggerClass}>role=&quot;dialog&quot;</span>}
        >
          <div className="p-3 text-sm text-foreground">Rich panel content</div>
        </Dropdown>
        <Dropdown fullWidth trigger={<span className={triggerClass}>fullWidth</span>}>
          <div className="p-3 text-sm text-foreground">Panel matches the trigger width</div>
        </Dropdown>
      </div>
    </StorySection>

    <StorySection inContext={true} title="Examples">
      <div className="flex items-center gap-4 text-gray-12">
        <span className="text-sm">Filter</span>
        <Dropdown
          align="end"
          aria-label="Countries"
          role="dialog"
          trigger={
            <span className={triggerClass}>
              <LocationIcon size={18} />
              All countries
            </span>
          }
        >
          <div className="flex flex-col gap-2 p-3">
            <Checkbox appearance="checkbox">India</Checkbox>
            <Checkbox appearance="checkbox">France</Checkbox>
          </div>
        </Dropdown>
      </div>
    </StorySection>

    <div />
  </StoryWrapper>
)

Default.storyName = 'Dropdown'
