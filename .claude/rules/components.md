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

1. **Check `src/components/atoms/`** — Alert, Button, IconButton, Checkbox, Chip,
   Drawer, Dropdown, Link, Select, Slider, Spinner, ToggleGroup already exist and
   carry the app's tokens and focus behaviour.
2. **Check Radix** for an unstyled primitive to build on (`@radix-ui/react-*` —
   dialog, select, checkbox, switch, slider, toggle-group, dropdown-menu, label
   are installed). Radix owns the interaction/ARIA; we own the Tailwind skin.
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

## Widget / embedding constraints

This app ships as the `<sahaj-atlas>` custom element (`src/Widget.tsx`) embedded
in host pages, **and** runs standalone in dev. Because of that:

- Routing uses **HashRouter** with basename `!` (the widget owns `window.location.hash`).
  Build links with `react-router` `<Link>` / `useNavigate`, never hardcode `#!`.
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

## Accessibility

`jsx-a11y` is enabled. Pair `onClick` on non-button elements with keyboard
handlers (or use a real `<button>` / our `Button` atom), and provide `alt`/ARIA
labels. The lint warns; don't ignore it on interactive elements.
