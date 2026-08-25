import type { Story, StoryDefault } from '@ladle/react'

import { StoryWrapper, StorySection } from '../../ladle'

import { SettingsMenu } from './SettingsMenu'

import { atlasConfigQuery } from '@/config/api'
import { WHOLESALE_GC_TIME, queryClient } from '@/config/query-client'

/**
 * The operator's language set, seeded into the cache the way `SearchFilters.stories` seeds the
 * feed — through the shared query factory, never a hand-written key, because a divergent one
 * misses in silence and the story goes to the network instead of rendering the state it exists
 * to show.
 *
 * Two things this buys. Ladle claims no API key, so without it the picker fires an
 * unauthenticated `GET /globals/sy-atlas-config` at the real CMS, gets a 403, and falls back —
 * correct, but a request the playground never used to make. And the fallback is every bundle
 * this build ships, so the story would demonstrate the OLD behaviour: a narrowed picker is the
 * whole point of the change, and here it is four rows out of ten.
 */
const OFFERED = ['en', 'fr', 'nl', 'de']

// ⚠ At module scope, not in an effect. An effect runs after the first render, by which point
// `useQuery` has already issued the request this seed exists to avoid — measured: the picker
// showed the right four rows and still hit the CMS. The story's decorator (`.ladle/components`)
// mounts this same singleton through `Providers`, so writing to it before any story renders is
// what makes the read a cache hit rather than a race.
// ⚠ `setQueryData` alone is not enough: it builds the entry from the client's DEFAULT options,
// so the factory's hour-long `gcTime` is lost and, with no observer mounted, the seed is
// garbage-collected after five minutes. A reviewer who opened the canvas and reached this story
// later would get exactly what the seed exists to prevent — a live 403 and all ten rows.
queryClient.setQueryDefaults(atlasConfigQuery().queryKey, { gcTime: WHOLESALE_GC_TIME })
queryClient.setQueryData(atlasConfigQuery().queryKey, {
  languages: OFFERED.map((code) => ({ code })),
})

export default { title: 'Molecules' } satisfies StoryDefault

/**
 * SettingsMenu — the cog that carries language and theme. Built directly on
 * `@radix-ui/react-dropdown-menu` rather than the Dropdown atom: it needs Sub
 * (the language submenu), RadioGroup and ItemIndicator, which the atom's popover
 * shell deliberately doesn't model.
 *
 * The menu portals into the theme root, so open it to inspect the panel — it
 * renders outside this section's box. Language and theme changes are live: they
 * drive i18next and the theme class for the whole Ladle canvas.
 */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection
      description="The trigger is an icon-only button with an accessible name. Opening it reveals the theme radio group and the language submenu."
      title="Trigger"
    >
      <div className="flex items-center gap-6">
        <SettingsMenu />
      </div>
    </StorySection>

    <StorySection
      description="`side` points the panel away from the trigger's screen position — bottom for the top-left cog on the map, top for the bottom-left cog when map-less."
      title="Sides"
    >
      <div className="flex items-center gap-10">
        <StorySection title='side="bottom"' variant="subsection">
          <SettingsMenu side="bottom" />
        </StorySection>
        <StorySection title='side="top"' variant="subsection">
          <SettingsMenu side="top" />
        </StorySection>
      </div>
    </StorySection>

    <StorySection
      description="The cog floats over whatever is behind it (the map, or a filled panel), so it carries its own border + shadow rather than relying on the surface under it."
      inContext={true}
      title="Examples"
    >
      <div className="relative h-32 w-full overflow-hidden rounded-lg bg-gray-4">
        <SettingsMenu className="absolute bottom-3 start-3" side="top" />
      </div>
    </StorySection>

    <div />
  </StoryWrapper>
)

Default.storyName = 'Settings Menu'
