# Sahaj Atlas — Design System

This document defines how components in the Sahaj Atlas widget are **classified,
organised, exported, typed, and styled**. It is the contract that
[`.claude/rules/components.md`](.claude/rules/components.md) points at and that
every new component should follow.

Companion doc: [`STORYBOOK.md`](STORYBOOK.md) — how we preview these components in
[Ladle](https://ladle.dev/) using the shared story helpers (in parity with WeMeditateWeb).

> **Scope guardrail.** [Radix UI](https://www.radix-ui.com) primitives
> (`@radix-ui/react-*`) are our unstyled interaction layer; the atoms in
> `src/components/atoms/` are the styled surface over them. This system adds
> _structure and previews_ — it is not a visual redesign.
>
> NextUI was the original primitive layer and has been **fully removed**; it is
> not a dependency. If a doc or comment still says otherwise, the doc is stale.

## Atomic taxonomy

We follow [atomic design](https://bradfrost.com/blog/post/atomic-web-design/),
adapted to our Radix + Mapbox stack. Components live under `src/components/`,
grouped by **tier** rather than by domain:

Each component lives in its own **PascalCase folder** (mirroring WeMeditateWeb):

```
src/components/
  atoms/        # primitives: render from props; no data fetching or navigation
  molecules/    # small compositions of atoms; data passed in via props
  organisms/    # data-connected / stateful sections (React Query, the map, forms)
  atoms/Chip/                 # one folder per component
    Chip.tsx                  #   the component (PascalCase, matches the folder)
    Chip.stories.tsx          #   co-located Ladle stories
    index.ts                  #   component barrel: explicit `export { Chip }` + `ChipProps`
  <tier>/index.ts             # tier barrel — the public import surface
src/views/      # URL-driven drawer screens (DrawerStack + one folder per route)
src/lib/        # pure domain utilities (no React/i18n) — e.g. events.ts (isSoon)
```

### What goes where

| Tier         | Definition                                                                                                        | May use                                                                | Must **not** do                           |
| ------------ | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------- |
| **Atom**     | Smallest building block. Renders from its props alone.                                                            | Radix primitives, Tailwind, icons, `useTheme`/`useLocale`/i18n labels | Fetch data, read app stores, navigate     |
| **Molecule** | A small, reusable composition of atoms forming one UI unit.                                                       | Everything an atom may, plus light store reads / a `useNavigate` link  | Own a data-fetch lifecycle, drive the map |
| **Organism** | A complex, often data-connected section of the UI.                                                                | React Query, zustand stores, the Mapbox instance, `react-hook-form`    | —                                         |
| **View**     | A URL-driven drawer screen that arranges organisms/molecules for one route. Lives in `src/views/`.                | Composition, responsive layout, route data via Suspense queries        | Own the map directly (use `MapController`) |

Atomic design is a guide, not a straitjacket: a molecule reading a single store
slice or rendering a router `<Link>` is fine. The dividing line that matters most
here is **organisms own data/network/map lifecycles; atoms and molecules don't.**

### Current classification

**Atoms** (`src/components/atoms/`)

| Folder                | Exports                                              | Notes                                                                                                                                   |
| --------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `Icons/` (sub-module) | `*Icon`, `Logo`, `SocialIcon`, …                     | SVG primitives; grouped module with its own `index.tsx`. `BaseIcon`'s `flipRtl` marks directional glyphs that mirror under RTL          |
| `Alert/`              | `Alert`                                              | Status/error banner (`tv()`); `role` defaults to `status`, `alert` is opt-in for genuine errors                                          |
| `Button/`             | `Button`, `controlSurface`                           | The app's one control. `shape` is rect (label) / square / circle — icon-only shapes take their width from the size scale, so there is no separate IconButton. `<button>`, or `<a>` when given `href` (that arm omits `disabled` — an anchor has no disabled state). `controlSurface` is the shared colour × variant recipe |
| `Checkbox/`           | `Checkbox`                                           | Radix toggle with `appearance: 'switch' \| 'checkbox'` (default `switch`); the checkbox appearance backs the registration consent field |
| `Chip/`               | `Chip`                                               | Pure presentational atom; brand-token styling (`tv()`). `onClose`/`closeLabel` are a union — a close button always has a label          |
| `Drawer/`             | `Drawer`, `DrawerContent`/`Header`/`Body`/`Footer`/`Close` | vaul drawer; left ≥md / bottom sheet on mobile, non-modal; portals into the themed root. `mode: 'anchored' \| 'filled'` (filled = map-less). The single surface abstraction |
| `Dropdown/`           | `Dropdown`                                           | Floating-UI **popover shell**: portaled, flip/shift (`tv()`). Not a menu — menus use Radix DropdownMenu (see `SettingsMenu`)            |
| `Link/`               | `Link`                                               | Router link, or `<a>` for external/`mailto:`/`tel:`; forwards a ref (used as a whole-card hit target)                                    |
| `Select/`             | `Select`, `SelectItem`, `fieldChrome`                | Radix select on brand tokens. `fieldChrome` is the shared input recipe (also used by the registration fields + filter date bounds)      |
| `Slider/`             | `Slider`                                             | Radix slider; `thumbLabels` labels each thumb (the time-of-day range filter)                                                            |
| `Spinner/`            | `Spinner`                                            | SVG spinner; `decorative` drops the live region when the parent already announces busy (Button)                                         |
| `ToggleGroup/`        | `ToggleGroup`, `ToggleGroupItem`                     | Radix toggle group — the filter panel's format/frequency/day pills                                                                     |

**Molecules** (`src/components/molecules/`)

| Folder               | Exports                            | Notes                                                                                         |
| -------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------- |
| `ActionRow/`         | `ActionRow`, `ActionCircle`        | The labelled tonal-circle action row under an event's Register CTA; always one line           |
| `ActiveFilterPills/` | `ActiveFilterPills`                | Removable pills for the active URL filters                                                    |
| `EventCard/`         | `EventCard`                        | Per-event summary card in a list                                                              |
| `EventFacts/`        | `EventFacts`                       | The shared calendar/location fact block; `variant="compact"` is what result cards use          |
| `EventMetadata/`     | `EventMetadata`                    | Schema.org / OG `<head>` tags (Helmet); renders no visible UI, so it has **no story**         |
| `Fallbacks/`         | `LoadingFallback`, `ErrorFallback` | Suspense / error-boundary fallbacks (compose `Alert`/`Spinner`)                               |
| `ImageCarousel/`     | `ImageCarousel`, `Slide`           | Generic Swiper carousel (`slides`); folds in the lazy YARL lightbox (own chunk)               |
| `List/`              | `List`, `listRow`                  | Scrollable `<ul>` for region/event rows. `listRow` is the shared row chrome + gutter          |
| `NearbyPrompt/`      | `NearbyPrompt`                     | The IP-geolocated "events near you?" suggestion line                                          |
| `RegionCard/`        | `RegionCard`                       | Every row in a region list: the country → region → area drill-down AND the online-classes entry. `icon` is a fixed slot that sizes/spaces the glyph, so rows align whatever goes in it |
| `SearchFilters/`     | `SearchFilters`                    | The filter form (format / frequency / day / time / language); fully controlled                |
| `SettingsMenu/`      | `SettingsMenu`                     | The cog: theme radio group + language submenu, on Radix DropdownMenu (needs Sub/RadioGroup)   |
| `ShareContent/`      | `ShareContent`, `CopyField`        | Copyable URL + social-links block (reused by the share dialog and the registration thank-you) |
| `Summary/`           | `Summary`                          | Icon + text (+ subtext) fact lines; `variant="compact"` for dense contexts                    |

**Organisms** (`src/components/organisms/`)

| Folder                 | Exports                                                    | Notes                                                                                                                                                                                              |
| ---------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Mapbox/` (sub-module) | `Mapbox`, `MapSearch` (+ `layers.ts`, `themes.ts` helpers) | The Mapbox surface; see [`.claude/rules/mapbox.md`](.claude/rules/mapbox.md)                                                                                                                       |
| `EventsList/`          | `DynamicEventsList`                                        | Distance-sorted fetch; the presentational `EventsList` is module-private (single-use)                                                                                                              |
| `EventDetails/`        | `EventDetails`, `EventActions`, `EventHeader`, `EventRegisterBar`, `EventSurfaceProps` | The event panel family — facts → Register → actions → images → About. All take `EventSurfaceProps` (`{ event, basePath }`). Lazy-loaded — **not** in the tier barrel |
| `RegistrationForm/`    | `RegistrationForm`                                         | Form-only, config-driven registration (field chrome is private); rendered in the RegistrationView drawer body. **Not** in the barrel                                                               |

**Views** — `src/views/` holds the URL-driven drawer views (`DrawerStack` +
`CountriesView`/`SearchView`/`RegionView`/`OnlineView`/`EventView`/
`FilterView`/`RegistrationView`/`ShareView`), with shared pieces (`DrawerTitle`,
`CloseButton`, `FilterButton`, `SearchField`, `NearbySuggestion`) in
`views/shared.tsx`. `DrawerStack` derives the stack from the pathname
(`resolveStack`) and renders ONE vaul drawer holding the active view, with
ancestors as static peek cards behind it; map-less it renders a single
`mode="filled"` drawer. Folder-per-component, not re-exported through the
component barrels.

## Conventions

### Exports — named, one barrel per tier

- **Use named exports** for every component (no `export default`). This keeps the
  barrels clean and import names greppable.
- **Explicit named exports — never `export *`.** Each component `index.ts` lists
  exactly its public surface: `export { Chip }` + `export type { ChipProps }`.
  Each tier `index.ts` re-exports its folders the same explicit way. `export *`
  leaks internals, so it's banned in component and tier barrels.
- **What a barrel must _not_ export:** subcomponents and modals that are only
  reached through a public trigger, generic row/layout primitives, helper
  predicates/constants, and `tv()` variant maps. Make those **module-private**
  (don't `export` them) or, for pure domain logic, move them to `src/lib/`.
- **Documented multi-export exceptions** (the only barrels that surface more than
  one primary + its `Props`):
  1. **`Icons/`** — an icon-set module (keeps a single `export *`).
  2. **`Mapbox/`** — sub-module exposing `Mapbox` + `MapSearch` (layers/themes stay internal).
  3. **`Button/`** — `Button` + the `controlSurface` recipe it shares with `ActionCircle`.
  4. **`ToggleGroup/`** — the `ToggleGroup` + `ToggleGroupItem` compound.
  5. **`Select/`** — `Select` + `SelectItem`, plus the `fieldChrome` recipe every
     field-like control shares.
  6. **`Drawer/`** — `Drawer` + the `DrawerContent`/`DrawerHeader`/`DrawerBody`/
     `DrawerFooter` layout parts + `DrawerClose`. The single surface abstraction: a
     `Drawer` is `open`/`onOpenChange` controlled with `mode: 'anchored' | 'filled'`
     (filled = map-less), and every View composes it.
  7. **`ActionRow/`** — `ActionRow` + `ActionCircle` (the row and its one child type).
  8. **`List/`** — `List` + the `listRow` recipe its card children share.
  9. **`ShareContent/`** (molecules) — `ShareContent` + `CopyField` (also used by
     the event panel's desktop contact popover).
  10. **`Fallbacks/`** (molecules) — `LoadingFallback` + `ErrorFallback` (pending split into two folders).
- **App code (views, stories) imports from the tier barrel**:
  `import { Chip } from '@/components/atoms'`. The barrel is the public surface;
  layout can change behind it.
- **Inside `src/components`, components import each other by the _component folder_
  path** (`@/components/atoms/Chip`, `@/components/molecules/EventFacts`), not
  through a tier barrel. Going through the tier barrel here risks import cycles (a
  molecule that embeds an organism vs. an organism that embeds a molecule) and TDZ
  bugs; the per-component folder index is cycle-safe.
- Keep barrels free of logic — re-exports only (the one tolerated exception is the
  tiny `List` wrapper, co-located in `List/List.tsx`).
- **Atoms stay primitive; compositions inline or split by reuse.** An atom (e.g.
  `Chip`) never carries time/date/domain logic. Pure domain logic goes to
  `src/lib/` (`resolveEventDisplay`, the `isSoon` predicate, the time formatters).
  A **single-use** composition stays module-private in its one parent (the
  registration form's `Field`/`LabeledInput`); a **multi-use** one becomes a thin
  exported molecule (`EventFacts`, used by `EventCard` and the event panel) or a
  shared recipe (`listRow`, `fieldChrome`).
- **Code-split exception:** a heavy organism that is lazy-loaded (the event detail
  page lazy-imports `EventView`) is intentionally left _out_ of its tier barrel,
  so a barrel import doesn't pull it back into the static graph. Such components —
  and any reached only through them (`RegistrationForm`) — are imported by direct
  folder path. See `organisms/index.ts`.
- Component folders and files are **PascalCase** (`Chip/Chip.tsx`); non-component
  files stay kebab-case (hooks `use-x.ts` exporting `useX`, config, types, pages,
  layouts); zustand stores `useXState` (see [`.claude/rules/code-style.md`](.claude/rules/code-style.md)).

### Props typing

- Every component that takes props declares and **exports** a named
  `<Component>Props` type and destructures it in the signature. When the name
  would clash with an imported type, alias the **import** rather than renaming
  ours — e.g. a wrapper aliases the primitive's props as `RadixXProps` so our exported
  type stays `ChipProps`.
- **Prop-naming rule:** state/behavior booleans use `isX` (`isOpen`), with
  `showX` / `hideX` accepted for visibility toggles (`showTimeZone`); event
  handlers use `onX` (`onClose`); a prop that forwards a router link uses
  `href` / `backHref`; a prop that passes a zod/schema field through keeps that
  field's name (`online`, matching the `Event` schema) instead of inventing `isX`.
- Use an **`interface`** for a plain object shape; use a **`type`** when composing
  with `&` (extending a primitive's or a DOM element's props). Don't inline
  non-trivial prop shapes.
- `strict` is on — prefer precise types over `any` (see code-style rules).

### Styling & `tailwind-variants`

- Tailwind utility classes are the default; `clsx` for simple conditional joins.
- For any component with **size / color / state variants**, define them with
  **`tailwind-variants` (`tv()`)** instead of ad-hoc string concatenation — it is
  already a dependency and matches the Radix + Tailwind styling model. `Chip.tsx` is the
  reference implementation (variant-driven content/colour styling).
- Global styles live in `src/styles/globals.css`. The widget injects CSS via JS
  when embedded, so don't rely on a separate stylesheet `<link>`.

### When to wrap a Radix primitive

Radix ships unstyled behaviour, so a primitive nearly always needs *some* skin —
but wrap it in a named atom **only** when we need to:

1. **Bake in app defaults** used in many places (e.g. `Chip` fixes `radius`,
   `size`, `variant`; `Select` bakes in the shared `fieldChrome` + the themed
   portal target), or
2. **Add app-specific behaviour** a raw primitive can't express (e.g. `Drawer`'s
   vaul + portal-into-the-theme-root, `Dropdown`'s floating-UI popover).

Domain/date logic is **not** a reason to wrap an atom — that stays out of the atom
layer (single-use compositions live in their one parent; a pure predicate like
`isSoon` lives in `src/lib/`).

Otherwise, **use the Radix primitive directly** in the component that needs it —
as `SettingsMenu` does with `DropdownMenu`, because its Sub/RadioGroup needs
don't generalise. Don't create a pass-through wrapper that only renames props;
it's maintenance with no payoff.

## Previews (Ladle)

Every **atom, molecule, and non-map organism** has a co-located
`<Name>.stories.tsx` — the one exception is `EventMetadata`, which renders only
`<head>` tags and so has no story. Each story is a single consolidated `Default`
story built from the shared
`StoryWrapper` / `StorySection` / `StoryGrid` helpers in
[`src/components/ladle/`](src/components/ladle/), kept in **parity with
WeMeditateWeb**. Map organisms get lighter, token-gated coverage. Run `pnpm ladle`
to browse them. See [`STORYBOOK.md`](STORYBOOK.md) for the full conventions, the
section vocabulary, and the global decorator.

## Adding a component — checklist

1. Pick the tier (atom / molecule / organism) using the table above.
2. Create the folder `src/components/<tier>/<Name>/` with:
   - `<Name>.tsx` — **named**, **exported** primary component(s) + `<Name>Props` type;
   - `index.ts` — explicit `export { <Name> }` + `export type { <Name>Props }` (never `export *`);
   - `<Name>.stories.tsx` — co-located stories (light + dark; key variants).
3. Re-export the folder from `src/components/<tier>/index.ts`.
4. Use `tv()` if it has variants; reuse existing icons from `atoms/Icons/`.
5. Reference siblings by component-folder path (`@/components/<tier>/<Other>`).
6. `pnpm typecheck` and `pnpm ladle:build` must stay green.
