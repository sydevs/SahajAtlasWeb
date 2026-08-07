---
description: React component patterns — Radix primitives, tailwind-variants, widget context.
globs:
  - "src/components/**/*.tsx"
  - "src/views/**/*.tsx"
  - "src/providers.tsx"
alwaysApply: false
---

# Components (Radix + Tailwind)

> **Taxonomy & conventions live in [`DESIGN_SYSTEM.md`](../../DESIGN_SYSTEM.md)**
> (atoms / molecules / organisms, named exports + per-tier barrels, props typing,
> `tailwind-variants`, when-to-wrap-a-primitive). Story/preview conventions live in
> [`STORYBOOK.md`](../../STORYBOOK.md) (Ladle). Skim those before adding a component.

## Prefer the existing atoms, then Radix

**There is no NextUI in this repo** — it was removed in favour of
[Radix UI](https://www.radix-ui.com) primitives + `tailwind-variants`. Don't
reach for `@nextui-org/react`; it isn't a dependency.

Before hand-rolling UI, in this order:

1. **Check `src/components/atoms/`** — Alert, Button, Checkbox, Chip, Combobox,
   Drawer, Dropdown, Input, Link, Modal, RadioGroup, Select, Slider, Spinner,
   Textarea, ToggleGroup already exist and carry the app's tokens and focus
   behaviour. Drawer (vaul) is the surface for anything that's a *place* in the
   URL-driven stack; Modal (Radix Dialog) is the ephemeral one that never touches
   the URL or history. Input/Textarea wrap the native controls on the shared
   `fieldChrome` recipe; `Combobox` is the search-in-the-field picker (Radix Popover
   + cmdk — the region filter), `Select` the plain list picker. Every form-control
   atom shares one error/active-state interface: **`isInvalid`** (danger visual +
   `aria-invalid`, with `aria-describedby` for the error text) and **`highlight`**
   (primary-tints the *unselected* state, no layout shift, to flag an active
   filter) — see `DESIGN_SYSTEM.md`.
2. **Check Radix** for an unstyled primitive to build on (`@radix-ui/react-*` —
   dialog, select, popover, checkbox, switch, slider, toggle-group, dropdown-menu,
   label are installed). Radix owns the interaction/ARIA; we own the Tailwind skin.
3. Only then write something new, in the right atomic tier per `DESIGN_SYSTEM.md`.

Fewer custom components means less maintenance and a consistent look.

## Styling

- Tailwind 3 utility classes are the default. For components with variants
  (size/color/state), use **`tailwind-variants`** (`tv(...)`) rather than
  ad-hoc `clsx` string concatenation — it's already a dependency and matches the
  Radix + Tailwind styling model. See `src/components/atoms/Chip/Chip.tsx` for the reference usage.
- `clsx` is fine for simple conditional class joins.
- Global styles and Tailwind layers live in `src/styles/globals.css`. The
  widget injects its CSS via JS (`vite-plugin-css-injected-by-js`) so it works
  when embedded — don't rely on a separate stylesheet `<link>`.
- **That stylesheet lands in the HOST document, so every selector in it must be
  scoped to our own DOM.** Never write a bare element or third-party class selector
  (`.swiper-pagination-bullet`, `main`, `a`) or a `:root` custom property — nest it
  under a class only we render (`.swiper …`, `.sx-calendar …`, `.event-pin-popover
  …`). Both a bare `main {}` rule and a bare swiper-bullet rule have leaked out and
  restyled host pages already.
- **Host-authored rich text** carries the `.colored-links` utility, which owns the
  whole treatment for that content — link colour AND `break-words`. One unbreakable
  run (a pasted URL, or the U+2800 braille blanks authors use as spacing) otherwise
  widens the scroll container and gives the drawer a horizontal scrollbar. The
  Drawer's body slot is `overflow-x-hidden` as a backstop, not as the fix.

## Widget / embedding constraints

This app ships as the `<sahaj-atlas>` custom element (`src/Widget.tsx`) embedded
in host pages, **and** runs standalone in dev. Because of that:

- Routing uses **HashRouter** with basename `!` — but only when the fragment is the
  widget's to take. `mountRoute` (`src/lib/shape/hash.ts`) decides that once at mount, and
  on a host URL already carrying an anchor (`#respond`, `#comment-123` — routine on
  WordPress) the widget mounts a **MemoryRouter** instead and never writes to the URL at
  all. It used to render blank there. Consequences worth knowing: on such a page the
  widget's route isn't linkable, Back leaves the host page, and `<Link>` hrefs resolve
  against the host origin (issue #92).
  Build links with `react-router` `<Link>` / `useNavigate`, never hardcode `#!` — and note
  the hash has **two** spellings, `#!/x` (what the widget writes at boot) and `#/!/x` (what
  react-router writes thereafter, having normalised the basename to `/!`).
- **One `<sahaj-atlas>` per page.** A second element is refused in `connectedCallback` and
  never mounts, because the API key (`config/api/auth`) and BrandTheme's theme root are
  page-global singletons a second instance would silently share. A second copy of the embed
  *script* is a no-op too (`customElements.get` guard). Both say so via
  `reportIntegrationWarning` (`src/lib/report.ts`).
- Don't assume control of `<head>`, global CSS, or the full viewport — the host
  page owns those. Scope styles to the widget's own DOM.
- Provider stack lives in `src/providers.tsx` (React Query + Helmet + theme).
  Add new context providers there, not scattered across the tree.

## Structure

- Components are grouped by atomic tier — `src/components/{atoms,molecules,organisms}/`
  — each component in its own **PascalCase folder** (`Chip/Chip.tsx` + stories +
  `index.ts`), with a barrel `index.ts` per tier (the `Icons/` and `Mapbox/`
  sub-modules group several files); `src/views/` holds the route screens. App code
  imports from the tier barrels; components import each other by component-folder
  path. See `DESIGN_SYSTEM.md`.
- **Explicit named exports — no `export *`.** Every component and tier barrel
  lists exactly what it surfaces: the primary component(s) + the `<Name>Props`
  type. Single-use internals (private modals, row primitives, helper sub-cards)
  are **not** exported — keep them module-private. The only wildcard left is the
  `Icons/` icon-set module. See the export rules + exception list in `DESIGN_SYSTEM.md`.
- **Atoms stay primitive.** No time/date/domain logic in an atom — put pure
  domain helpers in `src/lib/` (e.g. `isSoon`) and keep single-use compositions
  inlined in their one parent.
- Keep components presentational where possible; pull data via hooks
  (`src/hooks/`) and React Query (`src/config/api`), and read shared state from
  zustand selectors. See `.claude/rules/data-layer.md` and
  `.claude/rules/i18n-and-state.md`.
- **A row in a list that grows should not subscribe to the URL.** `EventListItem` is the
  repo's one `React.memo`, because the search results list pages to hundreds of rows and
  would otherwise re-render all of them per press. `memo` only holds if the card takes
  what it needs as props: it reads the searched place from a prop rather than
  `useSearchParams`, since `?q` is rewritten on every geocoder keystroke and router
  context bypasses `memo` entirely.

## Accessibility

`jsx-a11y` is enabled. Pair `onClick` on non-button elements with keyboard
handlers (or use a real `<button>` / our `Button` atom), and provide `alt`/ARIA
labels. The lint warns; don't ignore it on interactive elements.
