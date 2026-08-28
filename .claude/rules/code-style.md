---
description: Global code style — formatting, imports, naming, icons, env access.
globs:
  - "src/**/*.ts"
  - "src/**/*.tsx"
alwaysApply: false
---

# Code Style

## Formatting (Prettier)

Formatting is owned by Prettier (`.prettierrc`), shared verbatim with the other
SY projects: **no semicolons, single quotes, trailing commas, 2-space indent,
print width 100**. Don't hand-format against this — the PostToolUse hooks run
Prettier + `eslint --fix` on every edited file. Run `pnpm lint:fix` to normalize
a file manually.

**Tailwind class order is automatic.** `prettier-plugin-tailwindcss` sorts every
class list into the canonical order, including inside `tv()` and `clsx()` calls
(`tailwindFunctions` in `.prettierrc`). Don't hand-order classes, and don't fight
the sort in review — with the order fixed, a diff in a class string is a real
change rather than a reshuffle, which is what makes copy-pasted chrome drifting
apart visible. Pinned to the `0.6.x` line: `0.8.x` targets Tailwind v4 and throws
on our v3 setup.

**Tailwind is `3.4.3` — v4 utilities don't exist, and an ungenerated class fails
SILENTLY.** It lands in the DOM with no CSS behind it, so lint, typecheck and the
unit lane all stay green while the style does nothing. Numeric `max-w-*` / `min-w-*`
are the trap that has actually bitten (v3.4's max-width scale is `xs…7xl` plus the
keywords, not the spacing scale) — `max-w-24` is inert, use `max-w-[6rem]`. After
adding any utility you don't already see used in the repo, confirm the **computed**
style rather than assuming the class works.

## Imports

- Use the **`@/` alias** (`@/components/...`, `@/config/...`, `@/types`) instead
  of deep relative paths. It maps to `src/` in both Vite and `tsconfig.json`.
- ESLint enforces `import/order` with blank lines between groups
  (type → builtin → object → external → internal → parent → sibling → index).
  The auto-fix handles ordering; don't fight it.
- **`react/jsx-sort-props`' autofix moves props but leaves comments where they sat**, so a
  commented prop inserted out of alphabetical order ends up documenting its neighbour — and lint
  goes green on the result. Adding `measureAgainst` with a three-line note to a sorted `<Drawer>`
  in #161 left that note over `handleOnly` and `handleOnly`'s note over it. Insert new props in
  alphabetical position by hand, and re-read the block after `--fix`.
- `unused-imports/no-unused-imports` auto-removes dead imports on fix — and the
  PostToolUse hook runs that fix after **every** edit. So an import added in a
  separate edit from its first use is stripped before the use lands, then fails
  typecheck with "Cannot find name". Add the import **and** its usage in the same
  edit (or add the usage first), never import-first-in-its-own-edit.

## Naming

- **Components** use **PascalCase, folder-per-component** (mirroring WeMeditateWeb):
  `src/components/<tier>/<Name>/{<Name>.tsx, <Name>.stories.tsx, index.ts}` — e.g.
  `atoms/Drawer/Drawer.tsx`. A folder may hold a small family of related exports
  named after the primary (e.g. `Fallbacks/`, which exports `LoadingFallback`,
  `ErrorFallback` and `FallbackPanel`). Views (`src/views/`) follow the same
  convention. See `DESIGN_SYSTEM.md`.
- **Everything else stays kebab-case**: hooks (`use-mapbox.ts`), config
  (`store.ts`), types (`event.ts`), and
  the grouped icon/mapbox sub-module source files.
- Components are PascalCase exports; hooks are `useX` camelCase; zustand stores
  are `useX` hooks like any other (`useViewState`, `useCameraHistory`,
  `useResultsReveal`) — the `State` suffix is not a convention, and only
  `useViewState` carries it.
- **Export style**: components and hooks use **named** exports; pages, layouts,
  and entry/singleton modules (`App`, `Widget`, `providers`, `config/api/*`,
  `config/i18n`) use default exports.
- **Props types**: name them `<Component>Props` (e.g. `EventListItemProps`). When
  that name would clash with an imported type, alias the **import** rather than
  renaming ours, so the exported type keeps its name (see `DESIGN_SYSTEM.md`).
- zod schemas are `XSchema`; the inferred type is `X` (see `src/types/`).

## TypeScript

- `strict` is on. Prefer precise types over `any`; `@typescript-eslint/no-explicit-any`
  is a warning, not silent.
- Unused vars/args are warnings unless prefixed `_` (`argsIgnorePattern: '^_.*?$'`).
- Run `pnpm typecheck` before opening a PR — the per-edit hook only surfaces
  errors in the file you just touched; cross-file breakage needs the full run.

## Environment variables

- Client code reads env via `import.meta.env.VITE_*`. **Only `VITE_`-prefixed
  vars reach the bundle** — everything else is build-time only.
- The bundle is **public**. Never reference a secret (`sk.` Mapbox token, raw
  API secret) in client code. Public defaults go in `.env`; secrets in
  `.env.local` (gitignored). See `.claude/docs/environment.md`.

## Icons & emojis

- Don't use emojis as UI icons. Interface glyphs come from **`lucide-react`**, imported
  directly at the call site — one 24px grid, 2px stroke, round caps and joins, outline
  only. Radix primitives and our atoms accept icon slots.
- **`src/components/atoms/Icons/` is brand marks only**: the Sahaja Yoga `Logo` and the
  three meeting-platform glyphs behind `SocialIcon`. Lucide removed its brand icons and
  redrawing them is a trademark problem, so those stay hand-drawn on `BaseIcon`. Don't add
  an interface glyph there.
- **A directional glyph needs `rtl:-scale-x-100` at its call site.** `BaseIcon`'s `flipRtl`
  used to carry that centrally and Lucide has no equivalent, so each drill-in chevron and
  the directions signpost declares it. Symmetric glyphs (globe, calendar, pin, share) never
  mirror, and neither does the external-link ↗.
- **The Icons story's gallery is the app's USAGE, not a catalogue.** An icon earns a row by
  being imported somewhere outside a story or test; the story links to lucide.dev for
  everything else. `Icons.usage.test.tsx` asserts the two agree in both directions, so a
  newly-used glyph fails the lane until it is listed and a glyph that loses its last call
  site cannot linger.

## After code changes

```bash
pnpm typecheck   # cross-file type safety
pnpm lint        # fails on any warning (--max-warnings 0); lint:fix to auto-fix
```
