// Organisms — complex, data-connected sections (React Query, the map, forms).
// Public import surface: `import { DynamicEventsList } from '@/components/organisms'`.
// See DESIGN_SYSTEM.md. Explicit named exports only. The Mapbox sub-module's
// layer/theme helpers are internal and not re-exported here (see
// .claude/rules/mapbox.md).
export { Mapbox, MapSearch } from './Mapbox'
export type { MapSearchProps } from './Mapbox'

// Only the data-connected container is public: the presentational `EventsList`
// is consumed solely by `DynamicEventsList` in the same file (and its story), so
// per DESIGN_SYSTEM.md's single-use rule it stays module-private.
export { DynamicEventsList } from './EventsList'
export type { DynamicEventsListProps } from './EventsList'

// NOTE: EventDetails / RegistrationForm are deliberately NOT re-exported. The
// EventView drawer view lazy-loads EventDetails
// (`lazy(() => import('@/components/organisms/EventDetails'))` in
// src/views/EventView/EventView.tsx) to keep it out of the main chunk, and that
// family is only reached through that dynamic import. Re-exporting them here
// would pull them back into every barrel consumer's static graph and defeat the
// code-split. Import them by direct path.
