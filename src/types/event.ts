import z from 'zod'

import { RegionRefSchema } from './region-ref'

export const EventTypeSchema = z.enum(['offline', 'online'])
export type EventType = z.infer<typeof EventTypeSchema>

// SahajCloud recurrence basis (the cadence detail is pre-computed server-side
// into `upcomingDates`, so the widget only distinguishes the broad type).
export const RecurrenceTypeSchema = z.enum(['DAILY', 'WEEKLY', 'MONTHLY'])
export type RecurrenceType = z.infer<typeof RecurrenceTypeSchema>

// Offline event location (`event.address` group). All fields are nullable; the
// geojson geometry comes from latitude/longitude when present.
export const EventAddressSchema = z.object({
  mapboxId: z.string().nullish(),
  street: z.string().nullish(),
  room: z.string().nullish(),
  postCode: z.string().nullish(),
  country: z.string().nullish(), // ISO 3166-1 alpha-2
  region: z.string().nullish(), // ISO 3166-2 subdivision
  city: z.string().nullish(),
  latitude: z.number().nullish(),
  longitude: z.number().nullish(),
})
export type EventAddress = z.infer<typeof EventAddressSchema>

// `event.schedule` group. `upcomingDates` is a virtual field of ISO date strings
// pre-computed by SahajCloud; `upcomingDates[0]` is the next occurrence.
export const EventScheduleSchema = z.object({
  firstDate: z.coerce.date(),
  // IANA tz of firstDate. The collection type marks it required, but the feed
  // returns null for events with no stored timezone — consumers fall back to UTC.
  firstDate_tz: z.string().nullish(),
  endTime: z.string().nullish(), // "HH:MM", same day
  recurrenceType: RecurrenceTypeSchema.nullish(),
  upcomingDates: z.array(z.coerce.date()).nullish(),
  icalRule: z.string().nullish(),
})
export type EventSchedule = z.infer<typeof EventScheduleSchema>

// Populated `images` upload (the SahajCloud `Image` collection). `url` is a
// virtual field derived from `filename` (which `getEvent` selects); it is nullish
// so a single file-less image can't fail the whole event read — consumers skip
// images without a url (mirrors the `SafeUrlSchema` / `firstDate_tz` tolerance).
export const EventImageSchema = z.object({
  url: z.string().nullish(),
  alt: z.string().nullish(),
})
export type EventImage = z.infer<typeof EventImageSchema>

// `event.registrationQuestions` — each enabled boolean adds a question to the form.
export const RegistrationQuestionsSchema = z.object({
  priorExperience: z.boolean().nullish(),
  referralSource: z.boolean().nullish(),
  healthInfo: z.boolean().nullish(),
  accessibility: z.boolean().nullish(),
  guests: z.boolean().nullish(),
})
export type RegistrationQuestions = z.infer<typeof RegistrationQuestionsSchema>

// Lexical richText document (`event.description`). Validated structurally; the
// minimal serializer in src/lib/shape/lexical.ts renders/flattens it.
export const LexicalDocumentSchema = z
  .object({ root: z.object({ children: z.array(z.unknown()) }).passthrough() })
  .passthrough()
export type LexicalDocument = z.infer<typeof LexicalDocumentSchema>

// CMS-authored URLs that get rendered into an `<a href>` (NextUI Link, outside
// the DOMPurify path). Reject non-http(s) schemes so a `javascript:`/`data:`
// value can't reach an href; drop the offending value rather than failing the
// whole event read.
const SafeUrlSchema = z
  .string()
  .url()
  .refine((url) => /^https?:/i.test(url), 'must be an http(s) URL')
  .nullish()
  .catch(null)

// Raw event as it appears in a geojson feature's `properties`, MINUS the one
// localized field. Everything here — schedule, address, languages, region ref,
// route — is identical in every locale, so the feed is fetched + cached once
// (`['geojson']`, no locale) and the localized `title` is joined back in by id from
// a per-locale titles sliver (`EventTitleSchema`). Map points build from this
// directly; list items add the joined title (see `EventSlimSchema`).
export const AgnosticFeedEventSchema = z.object({
  id: z.number(),
  eventType: EventTypeSchema,
  languages: z.array(z.string()),
  address: EventAddressSchema.nullish(),
  schedule: EventScheduleSchema.nullish(),
  region: RegionRefSchema,
  // Server-computed canonical route (region chain + `/<id>`); the list/map
  // navigate to it directly.
  webPath: z.string().nullish(),
})
export type AgnosticFeedEvent = z.infer<typeof AgnosticFeedEventSchema>

// The agnostic feed event with its localized `title` joined back in (by id) — the
// shape map/list view-models build on. `title` is the ONLY localized feed field.
export const FeedEventSchema = AgnosticFeedEventSchema.extend({ title: z.string() })
export type FeedEvent = z.infer<typeof FeedEventSchema>

// The per-locale id→title sliver from `GET /api/events` (select `title` only), kept
// separate from the feed so a language switch refetches only this (~5% of the feed).
export const EventTitleSchema = z.object({ id: z.number(), title: z.string() })
export type EventTitle = z.infer<typeof EventTitleSchema>

// Derived list/map view-model: a feed event plus its route and (when sorting by
// proximity) the distance from the search point in kilometres.
export const EventSlimSchema = FeedEventSchema.extend({
  path: z.string(),
  distance: z.number().optional(),
})
export type EventSlim = z.infer<typeof EventSlimSchema>

// Raw full event document from `GET /api/events/:id`.
export const EventDocSchema = z.object({
  id: z.number(),
  title: z.string(),
  eventType: EventTypeSchema,
  languages: z.array(z.string()),
  onlineUrl: SafeUrlSchema,
  address: EventAddressSchema.nullish(),
  schedule: EventScheduleSchema.nullish(),
  description: LexicalDocumentSchema.nullish(),
  images: z.array(EventImageSchema).default([]),
  contactPhone: z.string().nullish(),
  contactName: z.string().nullish(),
  registrationMode: z.enum(['sahaj-atlas', 'external']),
  externalRegistrationUrl: SafeUrlSchema,
  registrationLimit: z.number().nullish(),
  registrationQuestions: RegistrationQuestionsSchema.nullish(),
  region: RegionRefSchema,
  webPath: z.string().nullish(),
  webUrl: SafeUrlSchema,
})
export type EventDoc = z.infer<typeof EventDocSchema>

// Derived event-detail view-model: the document plus its route.
export const EventSchema = EventDocSchema.extend({
  path: z.string(),
})
export type Event = z.infer<typeof EventSchema>
