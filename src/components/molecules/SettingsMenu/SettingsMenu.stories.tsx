import type { Story, StoryDefault } from '@ladle/react'

import { StoryWrapper, StorySection } from '../../ladle'

import { SettingsMenu } from './SettingsMenu'

export default { title: 'Molecules' } satisfies StoryDefault

/**
 * SettingsMenu — the cog that carries language and theme. This is built
 * directly on `@radix-ui/react-dropdown-menu`, instead of the Dropdown
 * atom. It needs Sub (the language submenu), RadioGroup, and ItemIndicator,
 * which the atom's popover shell deliberately does not model.
 *
 * The menu portals into the theme root, so open it to inspect the panel — it
 * renders outside this section's box. Language and theme changes are live: they
 * drive i18next and the theme class for the whole Ladle canvas.
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection
      description="The trigger is an icon-only Button with an accessible name: `floating` (the default) over the map, `ghost` in a row of controls such as a header. Opening it reveals the theme radio group and the language submenu."
      title="Variants"
    >
      <div className="flex items-center gap-10 py-3">
        <StorySection title='variant="floating"' variant="subsection">
          <SettingsMenu />
        </StorySection>
        <StorySection title='variant="ghost"' variant="subsection">
          <SettingsMenu variant="ghost" />
        </StorySection>
      </div>
    </StorySection>

    <StorySection
      description="The cog floats over whatever is behind it (the map), so it is a `floating` Button: its own surface, border and shadow rather than the surface under it."
      inContext={true}
      title="Examples"
    >
      <div className="relative h-32 w-full overflow-hidden rounded-lg bg-gray-4">
        <SettingsMenu className="absolute start-3 top-3" />
      </div>
    </StorySection>

    <div />
  </StoryWrapper>
)

Default.storyName = 'Settings Menu'
