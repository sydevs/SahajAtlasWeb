// Molecules — small compositions of atoms; data passed in via props.
// Public import surface: `import { EventCard } from '@/components/molecules'`.
// See DESIGN_SYSTEM.md. Explicit named exports only — each folder surfaces its
// primary component(s) + `Props` type; single-use internals stay private.
export { SettingsMenu } from './SettingsMenu'
export type { SettingsMenuProps } from './SettingsMenu'

// SearchFilters — the controlled event-filters form (Format/Frequency/Day/Time/
// Language), rendered inside the FilterView drawer.
export { SearchFilters } from './SearchFilters'
export type { SearchFiltersProps } from './SearchFilters'

// ActiveFilterPills — the applied filters as removable pills at the top of the
// search results (rendered by the events list).
export { ActiveFilterPills } from './ActiveFilterPills'
export type { ActiveFilterPillsProps } from './ActiveFilterPills'

export { LoadingFallback, ErrorFallback } from './Fallbacks'

// ActionRow / ActionCircle — the labelled tonal-circle secondary actions under
// an event's Register CTA (Directions / Add to calendar / Contact / Share).
export { ActionRow, ActionCircle } from './ActionRow'
export type { ActionRowProps, ActionCircleProps } from './ActionRow'

// Summary — icon + plain-text fact lines (the event panel's when/where block).
export { Summary } from './Summary'
export type { SummaryProps, SummaryItem } from './Summary'

// EventFacts — the shared calendar/location Summary for an event, used by the
// panel, the list card, and the share/registration summaries.
export { EventFacts } from './EventFacts'
export type { EventFactsProps } from './EventFacts'

export { List } from './List'

export { RegionCard } from './RegionCard'
export type { RegionCardProps } from './RegionCard'
export { OnlineClassesCard } from './OnlineClassesCard'
export type { OnlineClassesCardProps } from './OnlineClassesCard'

export { EventCard } from './EventCard'
export type { EventCardProps } from './EventCard'

// ShareContent — the copyable URL + social-links block, reused by the ShareView
// drawer and the registration "thank you" screen. CopyField also serves the
// event panel's desktop contact popover.
export { ShareContent, CopyField } from './ShareContent'
export type { ShareContentProps } from './ShareContent'

export { ImageCarousel } from './ImageCarousel'
export type { ImageCarouselProps, Slide } from './ImageCarousel'

export { EventMetadata } from './EventMetadata'
export type { EventMetadataProps } from './EventMetadata'

// NearbyPrompt — the dismissible IP-geolocation "events near you" suggestion shown
// above the list on the top-level views (wired by NearbySuggestion in views/shared).
export { NearbyPrompt } from './NearbyPrompt'
export type { NearbyPromptProps } from './NearbyPrompt'
