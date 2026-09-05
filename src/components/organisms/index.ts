// Organisms are complex, data-connected sections: React Query, the map,
// forms. This is the public import surface:
// `import { DynamicEventsList } from '@/components/organisms'`. See
// DESIGN_SYSTEM.md. This uses explicit named exports only. The Mapbox
// sub-module's layer and theme helpers are internal, and this file does not
// re-export them (see docs/rules/mapbox.md).
export { Mapbox, MapSearch } from './Mapbox'
export type { MapSearchProps } from './Mapbox'

// Only the data-connected container is public: the presentational `EventsList`
// is consumed solely by `DynamicEventsList` and its own story, so per
// DESIGN_SYSTEM.md's single-use rule it stays module-private.
export { DynamicEventsList } from './EventsList'
export type { DynamicEventsListProps } from './EventsList'

// Only the mounted host is public. The form inside it is module-private
// (see the folder's index.ts). Unlike the code-split families below, this
// is a normal static import. The App mounts it at load, so the error
// fallbacks can reach it.
export { ReportIssueModal } from './ReportIssueForm'
export type { ReportIssueModalProps } from './ReportIssueForm'

// NOTE: EventDetails and RegistrationForm are deliberately NOT re-exported.
// The EventView drawer view lazy-loads EventDetails
// (`lazy(() => import('@/components/organisms/EventDetails'))` in
// src/views/EventView/EventView.tsx) to keep it out of the main chunk. That
// family is only reached through that dynamic import. Re-exporting them
// here would add them back into every barrel consumer's static graph, and
// defeat the code-split. Import them by direct path.
