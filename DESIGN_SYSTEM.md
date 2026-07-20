# Sahaj Atlas — Design System

This document defines how components in the Sahaj Atlas widget are **classified,
organised, exported, typed, and styled**. It is the contract that
[`.claude/rules/components.md`](.claude/rules/components.md) points at and that
every new component should follow.

Companion doc: [`STORYBOOK.md`](STORYBOOK.md) — how we preview these components in
[Ladle](https://ladle.dev/) using the shared story helpers (in parity with WeMeditateWeb).

> **Scope guardrail.** NextUI v2 (`@nextui-org/react`) stays our primitive layer.
> This system adds _structure and previews_ around the existing components — it is
> not a rebuild of NextUI-backed components and not a visual redesign.

## Atomic taxonomy

We follow [atomic design](https://bradfrost.com/blog/post/atomic-web-design/),
adapted to our NextUI + Mapbox stack. Components live under `src/components/`,
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
src/layouts/    # templates: page-level layout scaffolds (see below)
src/lib/        # pure domain utilities (no React/i18n) — e.g. events.ts (isSoon)
```

### What goes where

| Tier         | Definition                                                                                                        | May use                                                                | Must **not** do                           |
| ------------ | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------- |
| **Atom**     | Smallest building block. Renders from its props alone.                                                            | NextUI primitives, Tailwind, icons, `useTheme`/`useLocale`/i18n labels | Fetch data, read app stores, navigate     |
| **Molecule** | A small, reusable composition of atoms forming one UI unit.                                                       | Everything an atom may, plus light store reads / a `useNavigate` link  | Own a data-fetch lifecycle, drive the map |
| **Organism** | A complex, often data-connected section of the UI.                                                                | React Query, zustand stores, the Mapbox instance, `react-hook-form`    | —                                         |
| **Template** | Page-level layout scaffold that arranges organisms/molecules and owns no business logic. Lives in `src/layouts/`. | Composition + responsive layout                                        | Fetch data, own entity state              |

Atomic design is a guide, not a straitjacket: a molecule reading a single store
slice or rendering a router `<Link>` is fine. The dividing line that matters most
here is **organisms own data/network/map lifecycles; atoms and molecules don't.**

### Current classification

**Atoms** (`src/components/atoms/`)

| Folder                | Exports                                              | Notes                                                                                                                                   |
| --------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `Icons/` (sub-module) | `*Icon`, `Logo`, `SocialIcon`, …                     | SVG primitives; grouped module with its own `index.tsx`                                                                                 |
| `Checkbox/`           | `Checkbox`                                           | Radix toggle with `appearance: 'switch' \| 'checkbox'` (default `switch`); the checkbox appearance backs the registration consent field |
| `Chip/`               | `Chip`                                               | Pure presentational atom; brand-token styling (`tv()`)                                                                                  |
| `Dropdown/`           | `Dropdown`, `DropdownItem`                           | Floating-UI popover: portaled, flip/shift (`tv()`)                                                                                      |
| `Drawer/`             | `Drawer`, `DrawerContent`/`Header`/`Body`/`Footer`/`Close` | vaul drawer (root or `nested`); left ≥md / bottom sheet on mobile, non-modal; portals into the themed root, or renders inline / `contained` when map-less. The single surface abstraction |
| `Select/`             | `Select`, `SelectItem`                               | Radix select on brand tokens (used by the registration form)                                                                            |

**Molecules** (`src/components/molecules/`)

| Folder           | Exports                            | Notes                                                                                         |
| ---------------- | ---------------------------------- | --------------------------------------------------------------------------------------------- |
| `Toolbar/`       | `Toolbar`                          | Drawer-footer bar: Sahaj Atlas wordmark + language + theme (`LanguageSelector` + `ThemeSwitch` are private files here) |
| `Fallbacks/`     | `LoadingFallback`, `ErrorFallback` | Suspense / error-boundary fallbacks (moved up from atoms; compose `Alert`/`Spinner`)          |
| `DetailRow/`     | `DetailRow`                        | Generic labelled icon row (icon slot + title + content + optional link)                       |
| `List/`          | `List`                             | Scrollable `<ul>` container for region/event rows                                             |
| `RegionCard/`    | `RegionCard`                       | Navigable region row (country → region → area drill-down)                                     |
| `EventCard/`     | `EventCard`                        | Per-event summary card in a list                                                              |
| `EventTime/`     | `EventTime`                        | Formatted event time range (timezone chip is a private composition)                           |
| `ShareContent/`  | `ShareContent`                     | Copyable URL + region-ordered `react-share` targets with a native Web Share fallback (share dialog + registration thank-you) |
| `ImageCarousel/` | `ImageCarousel`                    | Generic Swiper carousel (`slides`); folds in the lazy YARL lightbox (own chunk)               |
| `EventSoon/`     | `EventSoonChip`                    | "Starting soon" chip (the `isSoon` predicate lives in `src/lib`)                              |
| `EventMetadata/` | `EventMetadata`                    | Schema.org / OG `<head>` tags (Helmet); renders no visible UI, so it has **no story**         |

**Organisms** (`src/components/organisms/`)

| Folder                 | Exports                                                    | Notes                                                                                                                                                                                              |
| ---------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Mapbox/` (sub-module) | `Mapbox`, `MapSearch` (+ `layers.ts`, `themes.ts` helpers) | The Mapbox surface; see [`.claude/rules/mapbox.md`](.claude/rules/mapbox.md)                                                                                                                       |
| `EventsList/`          | `EventsList`, `DynamicEventsList`                          | List + distance-sorted fetch                                                                                                                                                                       |
| `EventDetails/`        | `EventDetails`                                             | Reusable event content body: carousel, description, timing/location/contact cards (the three detail cards live private in the folder); register/share CTAs navigate to the drawer routes. Lazy-loaded — **not** in the barrel |
| `RegistrationForm/`    | `RegistrationForm`                                         | Form-only, config-driven registration (field chrome is private); rendered in the RegistrationView drawer body. **Not** in the barrel                                                               |

**Views** — `src/views/` holds the URL-driven drawer views (`DrawerStack` +
`RootView`/`SearchView`/`RegionView`/`EventView`/`RegistrationView`/`ShareView`).
`DrawerStack` derives the open drawers from the pathname (`resolveStack`) and
renders RootView (base) + one nested vaul `Drawer` per ancestor; map-less it
renders the base inline + `contained` drawers. Folder-per-component, not
re-exported through the component barrels.

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
  1. **`Dropdown`** — the `Dropdown` + `DropdownItem` compound.
  2. **`Icons/`** — an icon-set module (keeps a single `export *`).
  3. **`Mapbox/`** — sub-module exposing `Mapbox` + `MapSearch` (layers/themes stay internal).
  4. **`EventsList/`** — the `DynamicEventsList` container + `EventsList` presentational pair.
  5. **`Drawer/`** — `Drawer` + the `DrawerContent`/`DrawerHeader`/`DrawerBody`/
     `DrawerFooter` layout parts + `DrawerClose`. The single surface abstraction: a
     `Drawer` is `open`/`onOpenChange` controlled, optionally `nested` (stacked over
     a parent) or `contained` (map-less), and every View composes it.
  6. **`Fallbacks/`** (molecules) — `LoadingFallback` + `ErrorFallback` (pending split into two folders).
- **App code (views, stories) imports from the tier barrel**:
  `import { Chip } from '@/components/atoms'`. The barrel is the public surface;
  layout can change behind it.
- **Inside `src/components`, components import each other by the _component folder_
  path** (`@/components/atoms/Chip`, `@/components/molecules/EventTime`), not
  through a tier barrel. Going through the tier barrel here risks import cycles (a
  molecule that embeds an organism vs. an organism that embeds a molecule) and TDZ
  bugs; the per-component folder index is cycle-safe.
- Keep barrels free of logic — re-exports only (the one tolerated exception is the
  tiny `List` wrapper, co-located in `List/List.tsx`).
- **Atoms stay primitive; compositions inline or split by reuse.** An atom (e.g.
  `Chip`) never carries time/date/domain logic. Pure domain logic goes to
  `src/lib/` (the `isSoon` predicate that `EventsList` sorts with). A
  **single-use** composition is inlined into its one parent (the timezone chip
  lives privately in `EventTime`); a **multi-use** composition becomes a thin
  exported molecule (`EventSoonChip`, used by `EventCard` and `EventView`).
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
  ours — e.g. `Chip` imports NextUI's props as `NextUIChipProps` so our exported
  type stays `ChipProps`.
- **Prop-naming rule:** state/behavior booleans use `isX` (`isOpen`), with
  `showX` / `hideX` accepted for visibility toggles (`showTimeZone`); event
  handlers use `onX` (`onClose`); a prop that forwards a router link uses
  `href` / `backHref`; a prop that passes a zod/schema field through keeps that
  field's name (`online`, matching the `Event` schema) instead of inventing `isX`.
- Use an **`interface`** for a plain object shape; use a **`type`** when composing
  with `&` (extending a NextUI component's props, as `Chip` does). Don't inline
  non-trivial prop shapes.
- `strict` is on — prefer precise types over `any` (see code-style rules).

### Styling & `tailwind-variants`

- Tailwind utility classes are the default; `clsx` for simple conditional joins.
- For any component with **size / color / state variants**, define them with
  **`tailwind-variants` (`tv()`)** instead of ad-hoc string concatenation — it is
  already a dependency and matches the NextUI styling model. `chip.tsx` is the
  reference implementation (variant-driven content/colour styling).
- Global styles live in `src/styles/globals.css`. The widget injects CSS via JS
  when embedded, so don't rely on a separate stylesheet `<link>`.

### When to wrap a NextUI primitive

Wrap a NextUI component in our own atom **only** when we need to:

1. **Bake in app defaults** used in many places (e.g. `Chip` fixes `radius`,
   `size`, `variant`, and uppercased bold content), or
2. **Add app-specific behaviour** a raw primitive can't express (e.g. `Panel`'s
   Suspense + error boundary, `Dropdown`'s floating-UI popover).

Domain/date logic, though, is **not** a reason to wrap an atom — that stays out of
the atom layer (a single-use composition like `EventTime`'s timezone chip lives
in its parent; a pure predicate like `isSoon` lives in `src/lib/`).

Otherwise, **use the NextUI primitive directly.** Don't create a pass-through
wrapper that only renames props — it's maintenance with no payoff.

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
