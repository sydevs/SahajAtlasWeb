// Molecules — small compositions of atoms; data passed in via props.
// Public import surface: `import { EventListItem } from '@/components/molecules'`.
// See DESIGN_SYSTEM.md. Explicit named exports only — each folder surfaces its
// primary component(s) + `Props` type; single-use internals stay private.
export { SettingsMenu } from './SettingsMenu'
export type { SettingsMenuProps } from './SettingsMenu'

// SearchFilters — the controlled event-filters form (Format/Frequency/Day/Time/
// Language), rendered inside the FilterView drawer.
export { SearchFilters } from './SearchFilters'
export type { SearchFiltersProps } from './SearchFilters'

// ActiveFilterPills — the applied filters as removable pills at the top of the
// search results (rendered by the events list). Props-free: it reads the filters
// from the URL itself.
export { ActiveFilterPills } from './ActiveFilterPills'

// CountrySiteOffer — the national-website next step shown when a search lands in a
// country that lists no programs at all (rendered by the events list's empty state).
export { CountrySiteOffer } from './CountrySiteOffer'
export type { CountrySiteOfferProps } from './CountrySiteOffer'

// OnwardOffer — what a dead link shows instead of an error: the sentence, one place to
// go (useRecoveryOffer picks it), and the prompted search field (issue #89).
export { OnwardOffer } from './OnwardOffer'
export type { OnwardOfferProps } from './OnwardOffer'

// ListToolbar — the controls row above a results list (a Filters button, plus a
// SortMenu on the search results). A thin justify-between layout; the views supply
// the controls.
export { ListToolbar } from './ListToolbar'
export type { ListToolbarProps } from './ListToolbar'

// SortMenu — the results-list sort selector (Recommended / Closest / Soonest),
// persisted in `?sort=`. A Radix DropdownMenu radio group (mirrors SettingsMenu).
export { SortMenu } from './SortMenu'

// Fallbacks — the suspense/error-boundary placeholders. `ErrorActions` is the shared
// button set both the app-level and drawer fallbacks render from one policy (issue #89).
export {
  LoadingFallback,
  ErrorFallback,
  ErrorActions,
  ErrorRegion,
  ResetErrorBoundary,
  useErrorDisplay,
  visibleActions,
  ERROR_POLICY,
} from './Fallbacks'
export type { ErrorFallbackProps, ErrorActionsProps, ErrorPolicy } from './Fallbacks'

// FormField — the label + control + help/error shell shared by the app's forms, and
// `fieldErrorId`, the single definition of the aria-describedby id convention.
export { FormField, fieldErrorId, fieldHelpId, fieldDescribedBy } from './FormField'
export type { FormFieldProps } from './FormField'

// ActionRow / ActionCircle — the labelled tonal-circle secondary actions under
// an event's Register CTA (Directions / Website / Contact / Share).
export { ActionRow, ActionCircle } from './ActionRow'
export type { ActionRowProps, ActionCircleProps } from './ActionRow'

// EventFacts — the shared calendar/location fact block for an event (builds and
// renders the when/where lines), used by the panel, the list card, and the
// share/registration summaries. `EventSummary` is its boxed, titled variant (the
// event-details card on the share + registration drawers).
export { EventFacts } from './EventFacts'
export type { EventFactsProps } from './EventFacts'
export { EventSummary } from './EventFacts'
export type { EventSummaryProps } from './EventFacts'

// The event's triage chips (type · language(s) · Today), shared by the list card
// and the event header so the two never drift. `compact` trims the list card.
export { EventChips } from './EventChips'
export type { EventChipsProps, EventChipsVariant } from './EventChips'

export { List } from './List'

export { ListItem } from './ListItem'
export type { ListItemProps } from './ListItem'

export { EventListItem } from './EventListItem'
export type { EventListItemProps } from './EventListItem'

// The secondary action row under an event's Register CTA. A molecule (no data
// lifecycle of its own — it reads the display resolver, like EventFacts), though
// it's composed by the EventDetails organism.
export { EventActions } from './EventActions'
export type { EventActionsProps } from './EventActions'

// ShareContent — the copyable URL + social-links block, reused by the ShareView
// drawer and the registration "thank you" screen. CopyField also serves the
// event panel's desktop contact popover.
export { ShareContent, CopyField } from './ShareContent'
export type { ShareContentProps } from './ShareContent'

export { ImageCarousel } from './ImageCarousel'
export type { ImageCarouselProps, Slide } from './ImageCarousel'

export { EventMetadata } from './EventMetadata'
export type { EventMetadataProps } from './EventMetadata'

// GeolocationPrompt — the dismissible IP-geolocation "events near you" suggestion
// shown above the list on the top-level views (wired by GeolocationSuggestion in
// views/shared).
export { GeolocationPrompt } from './GeolocationPrompt'
export type { GeolocationPromptProps } from './GeolocationPrompt'
