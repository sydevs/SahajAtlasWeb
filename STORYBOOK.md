# Component Storybook with Ladle

We preview components in isolation with **[Ladle](https://ladle.dev/)** (a
fast, Vite-native Storybook alternative). Our setup and story conventions
stay in **parity with the sister project
[WeMeditateWeb](https://github.com/sydevs/WeMeditateWeb)** — same helper
components, same story structure, same section vocabulary. Differences exist
only where our stack forces them (i18n over HTTP, Mapbox).

Companion doc: [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) — the component
taxonomy.

## Running it

```bash
pnpm ladle        # dev server at http://localhost:61000
pnpm ladle:build  # static build (also the CI gate — broken stories fail it)
```

## How it's wired

| Piece                     | What it does                                                                                                                                                                                                            |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.ladle/config.mjs`       | Story glob (`src/**/*.stories.{ts,tsx}`), title, port, `viteConfig`, and the story order: Atoms, Molecules, Organisms, Views, Interactive, then any other group, each alphabetical inside.                              |
| `.ladle/vite.config.ts`   | Resolves the `@/` alias to `src/` (Ladle relocates Vite's root). Points the app's SahajCloud origin at Ladle's own, serves the Turnstile challenge there, and swaps in `react-map-gl.tsx`.                              |
| `.ladle/backend.ts`       | Answers every SahajCloud read from the browser lane's fixtures (`src/mocks/sahajcloud.ts`), and seeds the visitor's approximate location as Cambridge. Ladle talks to no API.                                           |
| `.ladle/react-map-gl.tsx` | react-map-gl as a story needs it: `reuseMaps` off (a map carried between Ladle's iframe and its page drew nothing), a canvas that follows its own box, and the realm bridge mapbox-gl needs inside the viewport iframe. |
| `.ladle/i18n.ts`          | Self-contained i18next over the committed English snapshot and the screen-reader strings, English only.                                                                                                                 |
| `.ladle/components.tsx`   | The **global decorator**: React Query + Helmet + a `MemoryRouter` (fresh per story) + `<I18nextProvider>`.                                                                                                              |

**Theme and canvas.** Ladle's theme toggle drives the **whole canvas** — the
decorator calls `applyTheme()` with the toggle's state and stamps the `dark`
class as the app does. Check every story in both light and dark, and route
colours through semantic tokens (`foreground`, `gray-11`, `primary-9`…)
rather than fixed values, which is what makes the toggle safe. There is no
per-section override (`StorySection` has no `theme` prop) — wrap a component
in a div with the token background you want instead.

## Story utility components

Reusable helpers live in
[`src/components/ladle/`](src/components/ladle/) (ported from
WeMeditateWeb's `components/ladle`). **All stories must use them** — never
hand-rolled wrapper divs or raw headings.

### StoryWrapper

Outermost wrapper for every story (`import { StoryWrapper } from
'../../ladle'`). It provides consistent spacing (`flex flex-col gap-8 p-2`).

### StorySection

One flexible section component: title, optional description, automatic
divider.

**Props**: `title` (required), `description?`, `children`,
`background?: 'none'|'neutral'|'gradient'` (default `none`),
`variant?: 'section'|'subsection'|'scrollable'` (default `section`),
`inContext?: boolean` (default `false`).

- `variant="section"` → `h2` title + divider (major division).
- `variant="subsection"` → `p` title, no divider (nest within a section, one
  level only).
- `variant="scrollable"` → fixed 600px scroll area.
- `inContext` → "In Context - " prefix + bold top border (use for
  **Examples**).

### SeedSearchParams (filter-driven stories)

`import { SeedSearchParams } from '../../ladle'` seeds URL search params
(the filters' source of truth, read via `useEventFilters`) onto the
decorator's router — react-router forbids nesting a second `<Router>`.
Pass a **stable** `params` prop (a module-level `filtersToParams(...)`, or a
`useMemo`d one): it seeds once per `params` **identity**, so the story's own
writes (paging, clearing a filter) survive instead of being overwritten by a
re-seed. Memoize on the **case key**, not the query string — two cases
sharing a query would share one object and one seed, so switching between
them would not re-seed, and the first case's leftover URL state would carry
into the second. Used by ActiveFilterPills, CalendarView, and SearchView.

### ViewStory + stateControl (view stories)

`import { ViewStory, stateControl } from '@/views/story-harness'`. A view
story has **two independent axes**: an Example control (which case of the
view) and a **State** control (`None`, `Empty`, or a failure), kept separate
so any state shows against any example. Wrap the view in `<ViewStory
example={example} path={…} seed={…} state={state}>`, and build
`argTypes.state` from `stateControl(EMPTY, 'Not found · place')`.

`stateControl(...)` takes what **this view** reaches that others cannot —
its not-found flavour(s), and `EMPTY` if its list can come back empty — then
appends the fetch failures every data-reading view shares (offline, server,
config, unknown). A view whose routes cannot 404, with a single-panel body,
passes only what applies. It renders as a `select` rather than radios,
because the shared failures alone already total five, and a radio column
that tall would push the Example control off the panel.

**`EMPTY` is data, not a throw** — `ViewStory` renders the view as normal,
and the story seeds an emptied version of the selected example, making it a
real axis rather than one fixed "Empty" fixture standing in for every case.

**Pass the example's own `path`.** The recovery ladder walks the URL's
ancestry: a city offers its parent region. A country has no ancestor and
drops to the cached IP guess.

**The arg key is `state`, and that is load-bearing.** Ladle sorts the
controls panel alphabetically by arg key, ignoring declaration order —
`error` sorts above both `example` and `region`, putting the failure control
first on every story. Only Ladle's global "Brand palette" control sorts
higher.

**Every view also has two global controls**, `Form` and `Map`. The decorator
adds them to every `views--` story (`.ladle/components.tsx`) and `ViewHarness`
reads them, so a view story writes nothing for them, a new one gets them for
free, and their values hold as you move between views.

- **Form**: `Inline`, the view in the inline embed's page (its heading, and
  `InlineColumns` with the map beside it), or `Expanded`, the expanded map's
  frame with the real `DrawerStack` over the map, showing the story's view at
  its `path` — a side panel where the frame is wide, a bottom sheet where it is
  not, which drags and snaps as the app's does. Back and the view's links
  navigate for real, into the routed views, so a view story passes the `path`
  it lives at.
- **Map**, on by default: the live map, with a real `MapController`, so a view
  frames it as it does in the app. Off is a `map=false` embed, which is always
  inline whatever **Form** says, since there is no map to expand. It needs
  `VITE_MAPBOX_ACCESSTOKEN`, and without one every view renders map-less.

Both read from the address too, so a link opens in its form:
`?story=views--event&arg-form=Expanded`.

A view sets no viewport of its own, so it fills Ladle's main area, with
Ladle's padding taken away (`.ladle/components.tsx`); narrow the window or
pick a viewport to see the narrow forms. The map draws at any viewport width:
`.ladle/react-map-gl.tsx` bridges its container check across Ladle's viewport
iframe, and resizes the canvas with its box.

⚠ **With a token, the accessibility gate fails every view story on the map's
own controls** — the locate button and the Mapbox wordmark measure under the
44px floor, as `organisms--mapbox` already did. CI's library build carries no
token, so its gate renders the views map-less and does not see them.

### The whole widget (`Interactive / Full Widget`)

`src/App.stories.tsx` renders the real `App`, inline, on a stand-in host page:
browse, open a class and register, search, filter, expand the map and close it.
Its data is the SahajCloud fixtures, through the app's real fetchers, with a bigger
atlas of real places on top (`src/mocks/sahajcloud-demo.ts`) so every list scrolls.
A fixture the widget newly needs goes in `src/mocks/sahajcloud.ts`, where the browser
lane reads it too. **Map** off is a `map=false` embed; **White background**
paints the host page in the widget's own background, so the inline form
blends in.

### StoryGrid (matrices)

For multi-dimensional atom matrices (e.g. colour × state). Mobile-first: it
stacks below `sm`, and shows a normal table at `sm` and above. Compose it
from `StoryGrid`, `StoryGridHeader(Row/Cell)`, and `StoryGridBody` with
`StoryGridRow`/`StoryGridCell` (`isLabel` on the row-label cell) — import all
of them from `'../../ladle'`.

## Writing a story

One **consolidated `Default: Story`** per file — no Ladle `args`/`argTypes`
controls. Document via sections and grids instead. See
[`atoms/Chip/Chip.stories.tsx`](src/components/atoms/Chip/Chip.stories.tsx)
for the reference.

```tsx
import { StoryWrapper, StorySection } from '../../ladle'

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

- **Title** = the component's tier — `'Atoms'`, `'Molecules'`, or
  `'Organisms'` — optionally with a **single** `Tier / Group` subcategory
  for a closely related family (e.g. `'Molecules / List'` groups `List`,
  `ListItem`, `EventListItem`). Keep the tier as the first segment, and
  never nest deeper than one group. `Default.storyName` is the component
  name, and it **must be unique within a title** — Ladle keys each story by
  `title` + `storyName`.
- **Imports**: subject co-located (`./Chip`), helpers `../../ladle`,
  cross-component by alias (`@/components/atoms/Button`), fixtures from
  `@/mocks/events`.
- **Trailing `<div />`** removes the last section's divider.
- **Mock data**: use `@/mocks/events` fixtures, seeded picsum images
  (`https://picsum.photos/seed/<name>/<w>/<h>`), and **hash hrefs** (`href="#"`)
  so Ladle never navigates.
- **Atoms** with multi-dimensional variants use `StoryGrid`. **Molecules and
  organisms** use sections per variant with `Minimal`/`Maximal` subsections
  (no grids).

### Standard section order & names

Variants/Basic Examples → Sizes → Colors → Shapes → (component-specific) →
States → Widths → Padding → **Examples** (`inContext`). Skip what does not
apply. Use the canonical names — **Variants, Sizes, Colors, Shapes, States,
Widths, Padding, Examples** — not "Styles", "Types", "Use Cases", or similar.

**Molecules**: give each major variant its own section, with `Minimal`
(required props only) and `Maximal` (all optional props)
`variant="subsection"` blocks. Close with an `Examples` (`inContext`)
section showing realistic in-app usage.

## Map / network / i18n stories

- Map organisms (`Map`, `MapSearch`) need `VITE_MAPBOX_ACCESSTOKEN` and live
  data — keep them light, render a "needs token" notice when absent, and
  wrap them in `MapProvider`.
- Translated text resolves through the bundled-resource i18n instance, so
  stories render offline.
- A SahajCloud read a story makes — a view's own prefetch, the whole widget's
  boot — is answered by `.ladle/backend.ts`, never by production. One no fixture
  models answers 404 and logs `Ladle: no SahajCloud fixture answers …`.

## Best practices

Follow the Conventions above. The two mistakes that recur: a hand-rolled
wrapper `<div>` or raw `<h2>`/`<p>` heading instead of `StoryWrapper` and
`StorySection`, and a separate named export per variant instead of one
consolidated `Default`.

## Learn more

- [Ladle docs](https://ladle.dev/docs) · [CSF](https://ladle.dev/docs/stories)
- WeMeditateWeb `STORYBOOK.md` (the reference this mirrors)
