# Component Storybook with Ladle

We preview components in isolation with **[Ladle](https://ladle.dev/)** (a fast,
Vite-native Storybook alternative). Our setup and story conventions are kept in
**parity with the sister project [WeMeditateWeb](https://github.com/sydevs/WeMeditateWeb)** —
same helper components, same story structure, same section vocabulary. Differences
are only where our stack forces them (i18n-over-HTTP, Mapbox).

Companion doc: [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) — the component taxonomy.

## Running it

```bash
pnpm ladle        # dev server at http://localhost:61000
pnpm ladle:build  # static build (also the CI gate — broken stories fail it)
```

## How it's wired

| Piece                   | What it does                                                                                                                |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `.ladle/config.mjs`     | Story glob (`src/**/*.stories.{ts,tsx}`), title, port, and `viteConfig`.                                                    |
| `.ladle/vite.config.ts` | Resolves the `@/` alias to `src/` (Ladle relocates Vite's root).                                                            |
| `.ladle/i18n.ts`        | Self-contained i18next with the en/fr namespaces bundled (the app loads them over HTTP; Ladle has no backend).              |
| `.ladle/components.tsx` | The **global decorator**: React Query + Helmet (via `src/providers.tsx`) + a `MemoryRouter` + `<I18nextProvider>`. |

**Theme / canvas.** Ladle's theme toggle drives the **whole canvas**: the
decorator calls `applyTheme()` with the toggle's state, which stamps the `dark`
class the way the app does. So every story must read correctly in both light and
dark — check both before calling a story done, and route colours through the
semantic tokens (`foreground`, `gray-11`, `primary-9`…) rather than fixed values,
which is what makes the toggle safe.

There is no per-section theme override: `StorySection` has no `theme` prop. To
show a component against a specific surface, wrap it in a div with the token
background you want.

## Story utility components

Reusable helpers live in [`src/components/ladle/`](src/components/ladle/) (ported
from WeMeditateWeb's `components/ladle`). **All stories must use them** — never
hand-rolled wrapper divs or raw headings.

### StoryWrapper

Outermost wrapper for every story; provides consistent spacing (`flex flex-col gap-8 p-2`).

```tsx
import { StoryWrapper } from '../../ladle'

export const Default: Story = () => (
  <StoryWrapper>
    <StorySection title="Variants">{/* ... */}</StorySection>
  </StoryWrapper>
)
```

### StorySection

One flexible section component (title, optional description, automatic divider).

**Props**: `title` (required), `description?`, `children`,
`background?: 'none'|'neutral'|'gradient'` (default `none`),
`variant?: 'section'|'subsection'|'scrollable'` (default `section`),
`inContext?: boolean` (default `false`).

- `variant="section"` → `h2` title + divider (major division).
- `variant="subsection"` → `p` title, no divider (nest within a section; one level only).
- `variant="scrollable"` → fixed 600px scroll area.
- `inContext` → "In Context - " prefix + bold top border (use for **Examples**).

### SeedSearchParams (filter-driven stories)

Seeds URL search params (the filters' source of truth, read via `useEventFilters`) onto the
decorator's own router — react-router v7 forbids nesting a second `<Router>`. Pass a **stable**
`params` (module-level `filtersToParams(...)`, or `useMemo`d per case) — it seeds once per
`params` **identity**, so the story's own writes (paging the results, clearing a filter) survive
instead of being overwritten by a re-seed. Memoize on the **case key**, not on its query string:
two cases sharing a query would otherwise share one object and one seed, so switching between
them wouldn't re-seed and whatever the first left in the URL would carry into the second. Used by
the ActiveFilterPills, CalendarView + SearchView stories.

```tsx
import { SeedSearchParams } from '../../ladle'

const params = filtersToParams({ ...DEFAULT_FILTERS, format: 'online' })

;<SeedSearchParams params={params}>{/* view/component under test */}</SeedSearchParams>
```

### ViewStory + stateControl (view stories)

A view story has **two independent axes**: its Example control (which case of the view) and a
**State** control — `None`, `Empty`, or a failure. They are separate so any state can be seen
against any example; merged into one control, as they used to be, most combinations were
simply unreachable.

```tsx
import { EMPTY, NO_ERROR, ViewStory, stateControl } from '@/views/story-harness'

export const Default: Story<{ example: ExampleKey; state: StoryFallbackArg }> = ({ example, state }) => {
  const base = EXAMPLES[example]
  const region = state === EMPTY ? emptied(base) : base

  return (
    <ViewStory example={example} path={region.path} seed={…} state={state}>
      <RegionView slug={region.slug} />
    </ViewStory>
  )
}

Default.args = { example: 'Country', state: NO_ERROR }
Default.argTypes = { example: { … }, state: stateControl(EMPTY, 'Not found · place') }
```

`stateControl(...)` takes what **this view** can reach that others can't — its not-found
flavour(s), and `EMPTY` if its list can come back empty — and appends the fetch failures every
data-reading view shares (offline / server / config / unknown). A view whose routes can't 404
and whose body is a single panel passes only what applies. It renders a `select`: with the
shared failures appended the list runs to seven, and a radio column that tall pushes the
Example control off the panel.

**`EMPTY` is data, not a throw**, so `ViewStory` renders the view as normal and the story
seeds an emptied version of the selected example — which is what makes it a real axis rather
than one fixed "Empty" fixture standing in for every case.

**Pass the example's own `path`.** The recovery ladder walks the URL's ancestry, so the rung
a dead link offers falls out of where the example lives: a city offers its parent region, a
country has no ancestor and drops to the cached IP guess. That is what keeps the failure
states honest without a stub per case.

**The arg key is `state`, and that is load-bearing.** Ladle orders the controls panel
alphabetically by arg key, ignoring declaration order — `error` sorted above both `example`
and `region`, putting the failure control first on every story. Only Ladle's own global
"Brand palette" sorts higher than a story's own controls.

### StoryGrid (matrices)

For multi-dimensional atom matrices (e.g. colour × state). Mobile-first: stacks
below `sm`, normal table at `sm`+.

```tsx
import {
  StoryGrid,
  StoryGridHeader,
  StoryGridHeaderRow,
  StoryGridHeaderCell,
  StoryGridBody,
  StoryGridRow,
  StoryGridCell,
} from '../../ladle'

;<StoryGrid>
  <StoryGridHeader>
    <StoryGridHeaderRow>
      <StoryGridHeaderCell />
      <StoryGridHeaderCell>Primary</StoryGridHeaderCell>
    </StoryGridHeaderRow>
  </StoryGridHeader>
  <StoryGridBody>
    <StoryGridRow>
      <StoryGridCell isLabel>Row label</StoryGridCell>
      <StoryGridCell>{/* component */}</StoryGridCell>
    </StoryGridRow>
  </StoryGridBody>
</StoryGrid>
```

## Writing a story

One **consolidated `Default: Story`** per file (no Ladle `args`/`argTypes`
controls — we document via sections/grids instead). See
[`atoms/Chip/Chip.stories.tsx`](src/components/atoms/Chip/Chip.stories.tsx) for the
reference.

```tsx
import type { Story, StoryDefault } from '@ladle/react'

import { Chip } from './Chip' // subject: co-located
import { StoryWrapper, StorySection } from '../../ladle' // helpers
// mock data from @/mocks/events ; icons from @/components/atoms/Icons

export default { title: 'Atoms' } satisfies StoryDefault

/** Brief JSDoc: what the component is and what the story shows. */
export const Default: Story = () => (
  <StoryWrapper>
    <StorySection title="Variants">{/* ... */}</StorySection>
    <StorySection title="Examples" inContext={true}>
      {/* ... */}
    </StorySection>
    <div />
  </StoryWrapper>
)

Default.storyName = 'Chip'
```

Conventions:

- **Title** = the component's tier — `'Atoms'`, `'Molecules'`, or `'Organisms'` —
  optionally with a **single** `Tier / Group` subcategory that clusters a closely
  related family under its tier (e.g. `'Molecules / List'` groups `List`,
  `ListItem`, and `EventListItem`). Keep the tier as the first segment so the story
  still sorts under its folder tier, and don't nest deeper than one group.
  `Default.storyName` = the component name and **must be unique within a title**:
  Ladle keys each story by `title` + `storyName`, so same-title files (all the
  `'Molecules'` stories, or the three under `'Molecules / List'`) need distinct
  `storyName`s.
- **Imports**: subject co-located (`./Chip`); helpers `../../ladle`; cross-component
  by alias (`@/components/atoms/Icons`); fixtures from `@/mocks/events`.
- **Trailing `<div />`** removes the last section's divider.
- **Mock data**: use `@/mocks/events` fixtures; seeded picsum images
  (`https://picsum.photos/seed/<name>/<w>/<h>`); **hash hrefs** (`href="#"`) so
  Ladle never navigates.
- **Atoms** with multi-dimensional variants → `StoryGrid`. **Molecules/organisms**
  → sections per variant with `Minimal`/`Maximal` subsections (no grids).

### Standard section order & names

Variants/Basic Examples → Sizes → Colors → Shapes → (component-specific) → States
→ Widths → Padding → **Examples** (`inContext`). Skip what doesn't apply. Use the
canonical names: **Variants, Sizes, Colors, Shapes, States, Widths, Padding,
Examples** (not "Styles"/"Types"/"Use Cases"/etc.).

**Molecules**: each major variant its own section, with `Minimal` (required props
only) and `Maximal` (all optional props) `variant="subsection"` blocks; close with
an `Examples` (`inContext`) section showing realistic in-app usage.

## Map / network / i18n stories

- Map organisms (`Map`, `MapSearch`) need `VITE_MAPBOX_ACCESSTOKEN` and live data —
  keep them light and render a "needs token" notice when absent; wrap in
  `MapProvider`.
- Translated text resolves through the bundled-resource i18n instance, so stories
  render offline.

## Best practices

**DO** ✅ — use `StoryWrapper` as the outermost element; use `StorySection`/
`StoryGrid` for all structure; one consolidated `Default` story; standard section
names/order; `inContext` for Examples; trailing `<div />`; JSDoc the story; seeded
picsum + hash hrefs.

**DON'T** ❌ — custom wrapper divs or raw `<h2>`/`<p>` headings; separate named
exports per variant; Ladle `args`/`argTypes` controls; lorem ipsum or real
navigating hrefs; manual dividers (StorySection adds them).

## Learn more

- [Ladle docs](https://ladle.dev/docs) · [CSF](https://ladle.dev/docs/stories)
- WeMeditateWeb `STORYBOOK.md` (the reference this mirrors)
