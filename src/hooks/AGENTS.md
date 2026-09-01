# Hooks

Two subsystems reach into this directory; their rules live with the subsystem:

- `use-filters.ts`, `use-locale.ts`, `use-reveal.ts`, `use-sort.ts` — i18next and
  the zustand store. See [`src/config/AGENTS.md`](../config/AGENTS.md).
- `use-mapbox.ts` — the map. See
  [`src/components/organisms/Mapbox/AGENTS.md`](../components/organisms/Mapbox/AGENTS.md).
