# Code Style

## Formatting (Prettier)

Prettier controls all formatting (`.prettierrc`). The rules match the other SY projects:

- No semicolons.
- Single quotes.
- Trailing commas.
- 2-space indent.
- Print width 100.

Do not format files by hand. PostToolUse hooks run Prettier and `eslint --fix` after every edit. Run `pnpm lint:fix` to format a file yourself.

**Tailwind class order is automatic.** `prettier-plugin-tailwindcss` sorts every class list into one canonical order. This includes classes inside `tv()` and `clsx()` calls (see `tailwindFunctions` in `.prettierrc`). Do not reorder classes by hand, and do not fight the sort in review. A fixed order makes a real class change visible in a diff instead of a reshuffle. This is how copy-pasted UI chrome that drifted apart becomes visible. We pin the plugin to the `0.6.x` line: `0.8.x` targets Tailwind v4 and throws an error against this repo's Tailwind v3 setup.

**Tailwind is `3.4.3`**. Tailwind v4 utilities do not exist here. An ungenerated class fails SILENTLY: it stays in the DOM with no CSS behind it. Lint, typecheck, and the unit lane all stay green while the style does nothing. The real trap: numeric `max-w-*` / `min-w-*` classes. Tailwind v3.4's max-width scale runs `xs`…`7xl` plus keywords, not the spacing scale, so `max-w-24` is inert — use `max-w-[6rem]` instead. After you add a utility class that nothing else in the repo already uses, check the element's **computed** style. Do not assume the class works.

## Imports

- Use the **`@/` alias** (`@/components/...`, `@/config/...`, `@/types`), not deep relative paths. It maps to `src/` in both Vite and `tsconfig.json`.
- ESLint enforces `import/order`: type → builtin → object → external → internal → parent → sibling → index, blank line between groups. The autofix handles ordering. Do not fight it.
- **`react/jsx-sort-props`'s autofix moves props but leaves comments where they sat**. A commented prop inserted out of order ends up documenting its neighbor instead, and lint stays green. In #161, this swapped a note for `measureAgainst` onto `handleOnly`, and `handleOnly`'s own note onto `measureAgainst`. Insert new props in alphabetical position by hand. Re-read the block after `--fix` runs.
- **`unused-imports/no-unused-imports` strips dead imports on every fix, and the PostToolUse hook runs that fix after every edit**. An import added in a separate edit from its first use gets stripped before the use lands. Typecheck then fails with "Cannot find name." Add the import and its usage together, in one edit — never the import alone, first.

## Naming

- **Components**: PascalCase, one folder per component (mirrors WeMeditateWeb) — `src/components/<tier>/<Name>/{<Name>.tsx, <Name>.stories.tsx, index.ts}`, e.g. `atoms/Drawer/Drawer.tsx`. A folder may hold a small family named after its primary export (e.g. `Fallbacks/` exports `LoadingFallback`, `ErrorFallback`, `FallbackPanel`). `src/views/` follows the same rule. See `DESIGN_SYSTEM.md`.
- **Everything else stays kebab-case**: hooks (`use-mapbox.ts`), config (`store.ts`), types (`event.ts`), the icon and mapbox sub-modules.
- Components export as PascalCase. Hooks export as camelCase `useX`. Zustand stores are `useX` hooks too (`useViewState`, `useCameraHistory`, `useResultsReveal`) — `State` is not a suffix convention, and only `useViewState` carries it.
- **Export style**: components and hooks use **named** exports. Pages, layouts, and entry/singleton modules (`App`, `Widget`, `providers`, `config/api/*`, `config/i18n`) use default exports.
- **Props types**: name them `<Component>Props` (e.g. `EventListItemProps`). On a name clash with an imported type, alias the **import**, not ours — the exported type keeps its name (see `DESIGN_SYSTEM.md`).
- Name zod schemas `XSchema`. Name the inferred type `X` (see `src/types/`).

## TypeScript

- `strict` is on. Prefer precise types over `any` — `@typescript-eslint/no-explicit-any` warns, it does not stay silent.
- Unused vars and args are warnings unless prefixed `_` (`argsIgnorePattern: '^_.*?$'`).
- Run `pnpm typecheck` before you open a PR. The per-edit hook only checks the file you just touched — cross-file breakage needs the full run.

## Environment variables

Client code reads env vars through `import.meta.env.VITE_*`. See `docs/environment.md` for the canonical reference: which prefix reaches the bundle, and where secrets belong.

## Icons and emojis

- Do not use emojis as UI icons. Interface glyphs come from **`lucide-react`**, imported at the call site: one 24px grid, 2px stroke, round caps and joins, outline only. Radix primitives and our atoms accept icon slots.
- **`src/components/atoms/Icons/` holds brand marks only**: the Sahaja Yoga `Logo` and the three meeting-platform glyphs behind `SocialIcon`. Lucide dropped its brand icons, and redrawing them is a trademark problem, so these stay hand-drawn on `BaseIcon`. Do not add an interface glyph here.
- **A directional glyph needs `rtl:-scale-x-100` at its call site.** `BaseIcon`'s old `flipRtl` prop carried this centrally. Lucide has no equivalent, so each drill-in chevron and the directions signpost declares it directly. Symmetric glyphs (globe, calendar, pin, share) never mirror, and neither does the external-link arrow.
- **The Icons story's gallery shows real USAGE, not a catalogue**. An icon earns a row only when code outside a story or test imports it. The story links to lucide.dev for every other icon. `Icons.usage.test.tsx` checks both directions agree. A newly used glyph fails the lane until listed, and one that loses its last call site cannot stay listed either.

## After code changes

```bash
pnpm typecheck   # cross-file type safety
pnpm lint        # fails on any warning (--max-warnings 0); lint:fix to auto-fix
```
