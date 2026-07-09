// Molecules — small compositions of atoms; data passed in via props.
// Public import surface: `import { EventCard } from '@/components/molecules'`.
// See DESIGN_SYSTEM.md. Explicit named exports only — each folder surfaces its
// primary component(s) + `Props` type; single-use internals stay private.
export { SettingsMenu } from './SettingsMenu'

export { LoadingFallback, ErrorFallback } from './Fallbacks'

// DetailRow — a generic labelled icon row; the event detail cards build on it.
export { DetailRow } from './DetailRow'
export type { DetailRowProps } from './DetailRow'

export { List } from './List'

export { RegionCard } from './RegionCard'
export type { RegionCardProps } from './RegionCard'

export { EventCard } from './EventCard'
export type { EventCardProps } from './EventCard'

export { EventTime } from './EventTime'
export type { EventTimeProps } from './EventTime'

// ShareContent — the copyable URL + social-links block, reused by the ShareView
// drawer and the registration "thank you" screen.
export { ShareContent } from './ShareContent'
export type { ShareContentProps } from './ShareContent'

export { ImageCarousel } from './ImageCarousel'
export type { Slide } from './ImageCarousel'

export { EventSoonChip } from './EventSoon'
export type { EventSoonChipProps } from './EventSoon'

export { EventMetadata } from './EventMetadata'
export type { EventMetadataProps } from './EventMetadata'
