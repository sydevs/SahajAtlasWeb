# Repo Conventions

## Conventional commits

Format: `<type>(<scope>): <subject>`

### Types

| Type       | When to use                                  |
| ---------- | -------------------------------------------- |
| `feat`     | New user-facing feature or behavior          |
| `fix`      | Bug fix                                      |
| `refactor` | Internal restructure with no behavior change |
| `chore`    | Tooling, config, dependencies, infra         |
| `docs`     | Documentation only                           |
| `perf`     | Performance improvements                     |
| `test`     | Test additions/changes (once a suite exists) |

### Scopes used in this repo

(Extend as new areas appear.)

- `map` — Mapbox map, layers, clustering, view state (`src/components/organisms/Mapbox/`)
- `search` — search bar / location search
- `api` — data layer, `@payloadcms/sdk` client, fetchers (`src/config/api/`)
- `event` / `venue` / `region` / `area` / `country` — entity pages & components
- `list` — event list views
- `i18n` — localization, locale files
- `state` — zustand stores
- `widget` — web-component embedding, routing, providers
- `ui` — Radix/Tailwind components, theming
- `deps` — dependencies
- `build` — Vite / TypeScript / build config
- `claude` — `.claude/*` config, hooks, rules, skills

### Title rules

- Imperative mood: "add", not "added" / "adds"
- ≤ 70 characters
- No trailing period
- Lowercase subject (after the colon)
- Closes refs go in the body, not the title

### Examples (good)

- `feat(map): cluster venues at low zoom`
- `fix(api): validate empty events response with zod`
- `refactor(state): split view-state selectors with useShallow`
- `chore(claude): add hooks, rules, and skills config`
- `feat(i18n): add German locale`

### Examples (avoid)

- ❌ `Updates` (vague, no type/scope)
- ❌ `feat: stuff` (no scope, vague subject)
- ❌ `fix(map): Fixed an annoying bug where the cluster wouldn't…` (>70 chars, past tense)

## Commit body

End multi-line commit bodies with:

```
Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
```
