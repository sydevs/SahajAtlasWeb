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

## Imports

- Use the **`@/` alias** (`@/components/...`, `@/config/...`, `@/types`) instead
  of deep relative paths. It maps to `src/` in both Vite and `tsconfig.json`.
- ESLint enforces `import/order` with blank lines between groups
  (type → builtin → object → external → internal → parent → sibling → index).
  The auto-fix handles ordering; don't fight it.
- `unused-imports/no-unused-imports` auto-removes dead imports on fix.

## Naming

- **Components** use **PascalCase, folder-per-component** (mirroring WeMeditateWeb):
  `src/components/<tier>/<Name>/{<Name>.tsx, <Name>.stories.tsx, index.ts}` — e.g.
  `atoms/Drawer/Drawer.tsx`. A folder may hold a small family of related
  exports named after the primary (e.g. `EventShare/`). Views (`src/views/`)
  follow the same convention. See `DESIGN_SYSTEM.md`.
- **Everything else stays kebab-case**: hooks (`use-mapbox.ts`), config
  (`store.ts`), types (`event.ts`), and
  the grouped icon/mapbox sub-module source files.
- Components are PascalCase exports; hooks are `useX` camelCase; zustand stores
  are `useXState`.
- **Export style**: components and hooks use **named** exports; pages, layouts,
  and entry/singleton modules (`App`, `Widget`, `providers`, `config/api/*`,
  `config/i18n`) use default exports.
- **Props types**: name them `<Component>Props` (e.g. `EventItemProps`); fall back
  to a local `Props` only when that name would clash with an imported type (e.g.
  `Chip` composes NextUI's `ChipProps`).
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

- Don't use emojis as UI icons. This repo has its own SVG icon components under
  `src/components/atoms/icons/` (`actions`, `socials`, `symbols`, …) — reuse those.
  NextUI components also accept icon slots.

## After code changes

```bash
pnpm typecheck   # cross-file type safety
pnpm lint        # fails on any warning (--max-warnings 0); lint:fix to auto-fix
```
