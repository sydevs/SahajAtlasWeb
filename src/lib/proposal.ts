import type { GeocodingFeature, GeocodingFeatureContextComponent } from '@mapbox/search-js-core'
import type { Position } from 'geojson'
import type {
  Event,
  EventAddress,
  EventSchedule,
  LexicalDocument,
  ProposalLocation,
  ProposedEventPatch,
  Weekday,
} from '@/types'

import { DateTime } from 'luxon'

import { distanceKm } from '@/lib/geo'
import { geocodeCountryCode } from '@/lib/geocode'
import { lexicalToText } from '@/lib/shape'

/**
 * The add-a-class and correction flows (#147), as pure data: the draft a visitor fills in, the
 * Events patch it becomes, and the listing it previews as. No React and no copy here — the
 * panel and the live listing both read these, so the two cannot disagree about what is sent.
 */

/** The numbered steps, in order. `more` is the optional detour off `review`, not a step. */
export const LISTING_STEPS = ['where', 'when', 'contact', 'about', 'review'] as const

export type ListingStep = (typeof LISTING_STEPS)[number] | 'more'

/** The parts of the listing a visitor can jump back to from review. */
export type ListingSection = Exclude<ListingStep, 'review'>

export type ListingRepeats = 'once' | 'weekly' | 'monthly'

/**
 * A geocoded place, captured at the moment it is picked. The ids are taken from the retrieve
 * rather than re-geocoded later: the sender needs the place's own id and the `place`, `region`
 * and `country` layers above it, and only that feature carries all four.
 */
export type PickedPlace = {
  /** The picked feature's own id — an address's goes in `proposed.address.mapboxId`. */
  mapboxId?: string
  /** One line naming the place, as the geocoder showed it. */
  label: string
  street?: string
  postCode?: string
  city?: string
  /** ISO 3166-2 subdivision, the Events address group's `region`. */
  region?: string
  /** ISO 3166-1 alpha-2. */
  country?: string
  latitude?: number
  longitude?: number
  /** The layers above the place, for intake to match to a region. */
  location: ProposalLocation
}

export type ListingDraft = {
  eventType: 'offline' | 'online'
  /** In person: the venue's address. */
  address: PickedPlace | null
  room: string
  /** Online: the join link, and the city the class is hosted from. */
  onlineUrl: string
  city: PickedPlace | null
  /** `YYYY-MM-DD`, in `timeZone`. */
  firstDate: string
  /** `HH:MM`, in `timeZone`. */
  startTime: string
  endTime: string
  repeats: ListingRepeats
  /** `YYYY-MM-DD`; only meaningful for a repeating class. */
  endDate: string
  /** IANA zone the date and times are read in. */
  timeZone: string
  contactName: string
  contactPhone: string
  contactEmail: string
  description: string
  title: string
  languages: string[]
  website: string
}

/** A blank listing. The zone is the visitor's own until a place names a better one. */
export const emptyDraft = (timeZone: string, languages: string[] = []): ListingDraft => ({
  eventType: 'offline',
  address: null,
  room: '',
  onlineUrl: '',
  city: null,
  firstDate: '',
  startTime: '',
  endTime: '',
  repeats: 'weekly',
  endDate: '',
  timeZone,
  contactName: '',
  contactPhone: '',
  contactEmail: '',
  description: '',
  title: '',
  languages,
  website: '',
})

// ── From the geocoder ────────────────────────────────────────────────────────────

/**
 * The region context entry, widened the way `geocodeCountryCode` widens the country one: the
 * API returns `region_code_full` (ISO 3166-2), the vendor type does not declare it.
 */
type RegionContext = GeocodingFeatureContextComponent & { region_code_full?: string }

/**
 * A retrieved feature, as the flow keeps it.
 *
 * A feature names its OWN layer by its own id, and the layers above it in `context`. So a
 * picked city is its own `placeId`, and a picked address takes its `placeId` from context.
 */
export const featureToPlace = (feature: GeocodingFeature): PickedPlace => {
  const properties = feature.properties
  const context = properties?.context ?? {}
  const type = properties?.feature_type
  const own = (layer: string, entry?: { mapbox_id?: string }) =>
    type === layer ? properties?.mapbox_id : entry?.mapbox_id
  const region: RegionContext | undefined = context.region
  const [longitude, latitude] = feature.geometry?.coordinates ?? []

  return {
    mapboxId: properties?.mapbox_id,
    label: properties?.full_address || properties?.name || '',
    street: type === 'address' ? properties?.name : context.address?.name,
    postCode: context.postcode?.name,
    city: type === 'place' ? properties?.name : (context.place?.name ?? context.locality?.name),
    region: region?.region_code_full,
    country: geocodeCountryCode(feature),
    latitude: properties?.coordinates?.latitude ?? latitude,
    longitude: properties?.coordinates?.longitude ?? longitude,
    location: compact({
      placeId: own('place', context.place),
      regionId: own('region', context.region),
      countryId: own('country', context.country),
    }),
  }
}

/**
 * Where a place search starts: the region the flow opened over. A map-less embed has no camera
 * to bias the geocoder, so the region's own centre is the only answer that holds everywhere.
 */
export const searchProximity = (
  center: Position | null | undefined,
): { lng: number; lat: number } | undefined =>
  center && center.length >= 2 ? { lng: center[0], lat: center[1] } : undefined

/** Where the class sits, for `sendProposal`'s `location`: the address, or an online class's city. */
export const draftLocation = (draft: ListingDraft): ProposalLocation =>
  (draft.eventType === 'online' ? draft.city?.location : draft.address?.location) ?? {}

/** The place a draft is anchored to, for the confirmation's city name and the timezone. */
export const draftPlace = (draft: ListingDraft): PickedPlace | null =>
  draft.eventType === 'online' ? draft.city : draft.address

// ── Validation ───────────────────────────────────────────────────────────────────

export type ListingField =
  | 'address'
  | 'city'
  | 'onlineUrl'
  | 'firstDate'
  | 'startTime'
  | 'contactEmail'

export type ListingErrors = Partial<Record<ListingField, true>>

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
const DATE = /^\d{4}-\d{2}-\d{2}$/
// The shape `type="email"` itself accepts. The server re-checks the submitter's own address.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const isEmail = (value: string): boolean => EMAIL.test(value.trim())

export const isWebUrl = (value: string): boolean => {
  try {
    return /^https?:$/.test(new URL(value.trim()).protocol)
  } catch {
    return false
  }
}

/** What stops a step from moving on. Contact and About may be skipped, but not filled wrongly. */
export const stepErrors = (step: ListingStep, draft: ListingDraft): ListingErrors => {
  const errors: ListingErrors = {}

  if (step === 'where') {
    if (draft.eventType === 'offline' && !draft.address) errors.address = true
    if (draft.eventType === 'online' && !isWebUrl(draft.onlineUrl)) errors.onlineUrl = true
    // An online class needs a city too: it is what places the listing in a region.
    if (draft.eventType === 'online' && !draft.city) errors.city = true
  }

  if (step === 'when') {
    if (!DATE.test(draft.firstDate)) errors.firstDate = true
    if (!HHMM.test(draft.startTime)) errors.startTime = true
  }

  if (step === 'contact' && draft.contactEmail.trim() && !isEmail(draft.contactEmail)) {
    errors.contactEmail = true
  }

  return errors
}

/** The first step a submit would be refused at, so the panel can send the visitor there. */
export const firstInvalidStep = (draft: ListingDraft): ListingStep | null =>
  (['where', 'when', 'contact'] as const).find(
    (step) => Object.keys(stepErrors(step, draft)).length > 0,
  ) ?? null

// ── To the Events patch ──────────────────────────────────────────────────────────

const WEEKDAYS: readonly Weekday[] = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']

/** A blank optional field is `null`, which is how a correction clears a value. */
const text = (value: string): string | null => value.trim() || null

/** The first session, as the instant the CMS stores, read in the draft's zone. */
const draftStart = (draft: ListingDraft): DateTime | null => {
  if (!DATE.test(draft.firstDate) || !HHMM.test(draft.startTime)) return null

  const start = DateTime.fromISO(`${draft.firstDate}T${draft.startTime}`, { zone: draft.timeZone })

  return start.isValid ? start : null
}

const draftSchedule = (draft: ListingDraft): ProposedEventPatch['schedule'] => {
  const start = draftStart(draft)

  if (!start) return undefined

  const repeating = draft.repeats !== 'once'
  const until = repeating && DATE.test(draft.endDate) ? draft.endDate : null

  return {
    firstDate: start.toUTC().toISO() ?? undefined,
    // The draft's zone comes from the browser or a nearby listing; SahajCloud validates it
    // against its own list when the reviewer accepts.
    firstDate_tz: draft.timeZone as NonNullable<ProposedEventPatch['schedule']>['firstDate_tz'],
    endTime: HHMM.test(draft.endTime) ? draft.endTime : null,
    recurrenceType:
      draft.repeats === 'weekly' ? 'WEEKLY' : draft.repeats === 'monthly' ? 'MONTHLY' : null,
    ...(draft.repeats === 'weekly' ? { interval: 1, weekdays: [WEEKDAYS[start.weekday - 1]] } : {}),
    ...(draft.repeats === 'monthly'
      ? { interval: 1, monthlyMode: 'date' as const, monthDay: start.day }
      : {}),
    endingType: until ? 'until' : null,
    untilDate: until
      ? (DateTime.fromISO(until, { zone: draft.timeZone }).endOf('day').toUTC().toISO() ??
        undefined)
      : null,
  }
}

/** One paragraph per line, the shape the CMS's own editor writes. */
export const plainTextToLexical = (value: string): LexicalDocument | null => {
  const lines = value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length === 0) return null

  return {
    root: {
      type: 'root',
      format: '',
      indent: 0,
      version: 1,
      direction: 'ltr',
      children: lines.map((line) => ({
        type: 'paragraph',
        format: '',
        indent: 0,
        version: 1,
        direction: 'ltr',
        textFormat: 0,
        children: [
          { type: 'text', text: line, format: 0, detail: 0, mode: 'normal', style: '', version: 1 },
        ],
      })),
    },
  }
}

/**
 * The whole listing as an Events patch. Every key is one of `PROPOSABLE_EVENT_FIELDS`.
 *
 * Optional values that are blank come out `null` rather than absent, so a correction that
 * empties a field reads as a change; `newListingPatch` drops them for a new listing.
 */
export const draftToPatch = (draft: ListingDraft): ProposedEventPatch => {
  const online = draft.eventType === 'online'
  const address = draft.address

  return {
    eventType: draft.eventType,
    title: text(draft.title) ?? undefined,
    // The picker offers SahajCloud's own language codes.
    languages:
      draft.languages.length > 0
        ? (draft.languages as NonNullable<ProposedEventPatch['languages']>)
        : undefined,
    contactName: text(draft.contactName),
    contactPhone: text(draft.contactPhone),
    contactEmail: text(draft.contactEmail),
    website: isWebUrl(draft.website) ? draft.website.trim() : null,
    description: plainTextToLexical(draft.description) as ProposedEventPatch['description'],
    ...(online
      ? { onlineUrl: text(draft.onlineUrl) }
      : {
          address: address
            ? {
                mapboxId: address.mapboxId,
                street: address.street,
                room: text(draft.room),
                postCode: address.postCode,
                city: address.city,
                region: address.region,
                country: address.country,
                latitude: address.latitude,
                longitude: address.longitude,
              }
            : { room: text(draft.room) },
        }),
    schedule: draftSchedule(draft),
  }
}

const isGroup = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && !('root' in value)

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/** Drops absent and `null` leaves, and any group left empty. */
const compact = <T extends Record<string, unknown>>(patch: T): T =>
  Object.fromEntries(
    Object.entries(patch).flatMap(([key, value]) => {
      if (value === undefined || value === null) return []
      if (isGroup(value)) {
        const inner = compact(value)

        return Object.keys(inner).length > 0 ? [[key, inner]] : []
      }

      return [[key, value]]
    }),
  ) as T

/** A new listing's patch: everything the visitor filled in, nothing they left blank. */
export const newListingPatch = (draft: ListingDraft): ProposedEventPatch =>
  compact(draftToPatch(draft))

/**
 * The leaves of `next` that differ from `base` — a correction sends only what changed.
 *
 * Groups compare leaf by leaf, because SahajCloud merges a proposal into its target the way
 * Payload merges an update: `{ address: { room } }` changes the room and keeps the rest.
 * Arrays and rich text are values and compare whole. A leaf `next` leaves out is not a change;
 * one it sets to `null` is a clear.
 */
export const diffPatch = (
  base: ProposedEventPatch,
  next: ProposedEventPatch,
): ProposedEventPatch => {
  const walk = (
    from: Record<string, unknown>,
    to: Record<string, unknown>,
  ): Record<string, unknown> =>
    Object.fromEntries(
      Object.entries(to).flatMap(([key, value]) => {
        if (value === undefined) return []
        if (isGroup(value) && isGroup(from[key])) {
          const inner = walk(from[key] as Record<string, unknown>, value)

          return Object.keys(inner).length > 0 ? [[key, inner]] : []
        }

        return same(from[key], value) ? [] : [[key, value]]
      }),
    )

  return walk(base, next) as ProposedEventPatch
}

export type BuiltProposal = {
  event?: number
  proposed: ProposedEventPatch
  location: ProposalLocation
}

/**
 * What the panel sends. A correction compares the edited draft with the one the published
 * class opened as — both built by `draftToPatch`, so a section nobody touched produces the
 * same leaves and is not sent, however lossy the round trip from the CMS shape is.
 */
export const buildProposal = (
  draft: ListingDraft,
  correction?: { eventId: number; baseDraft: ListingDraft },
): BuiltProposal => {
  if (!correction) {
    return { proposed: newListingPatch(draft), location: draftLocation(draft) }
  }

  const proposed = diffPatch(draftToPatch(correction.baseDraft), draftToPatch(draft))
  // A correction re-places the class only when the visitor picked a new place.
  const location = same(draftPlace(draft), draftPlace(correction.baseDraft))
    ? {}
    : draftLocation(draft)

  return { event: correction.eventId, proposed, location }
}

// ── From a published class ───────────────────────────────────────────────────────

const placeFromAddress = (address: EventAddress): PickedPlace => ({
  mapboxId: address.mapboxId ?? undefined,
  label: [address.street, address.city].filter(Boolean).join(', '),
  street: address.street ?? undefined,
  postCode: address.postCode ?? undefined,
  city: address.city ?? undefined,
  region: address.region ?? undefined,
  country: address.country ?? undefined,
  latitude: address.latitude ?? undefined,
  longitude: address.longitude ?? undefined,
  location: {},
})

const REPEATS: Record<NonNullable<EventSchedule['recurrenceType']>, ListingRepeats> = {
  // The flow offers no daily choice, so a daily class opens as weekly. Untouched, it is not
  // sent — both sides of the diff read it the same way.
  DAILY: 'weekly',
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
}

/** A published class, opened for correction. */
export const eventToDraft = (event: Event): ListingDraft => {
  const schedule = event.schedule
  const timeZone = schedule?.firstDate_tz || 'UTC'
  const start = schedule ? DateTime.fromJSDate(schedule.firstDate).setZone(timeZone) : null
  const until =
    schedule?.endingType === 'until' && schedule.untilDate
      ? DateTime.fromJSDate(schedule.untilDate).setZone(timeZone)
      : null
  const regionName = event.region?.name ?? undefined

  return {
    eventType: event.eventType,
    address:
      event.eventType === 'offline' && event.address ? placeFromAddress(event.address) : null,
    room: event.address?.room ?? '',
    onlineUrl: '',
    city:
      event.eventType === 'online' && regionName
        ? { label: regionName, city: regionName, location: {} }
        : null,
    firstDate: start?.toISODate() ?? '',
    startTime: start?.toFormat('HH:mm') ?? '',
    endTime: schedule?.endTime ?? '',
    repeats: schedule?.recurrenceType ? REPEATS[schedule.recurrenceType] : 'once',
    endDate: until?.toISODate() ?? '',
    timeZone,
    contactName: event.contactName ?? '',
    contactPhone: event.contactPhone ?? '',
    // The widget never reads a class's contact address, so a correction starts it blank.
    contactEmail: '',
    description: lexicalToText(event.description),
    title: event.title,
    languages: event.languages,
    website: event.website ?? '',
  }
}

// ── The live listing ─────────────────────────────────────────────────────────────

/** How many sessions the preview projects, enough for the next-session line to resolve. */
const PREVIEW_SESSIONS = 8

/** The sessions a draft schedule would produce, from today on — the CMS computes the real ones. */
export const previewSessions = (draft: ListingDraft, now: DateTime = DateTime.now()): Date[] => {
  const start = draftStart(draft)

  if (!start) return []
  if (draft.repeats === 'once') return [start.toJSDate()]

  const until = DATE.test(draft.endDate)
    ? DateTime.fromISO(draft.endDate, { zone: draft.timeZone }).endOf('day')
    : null
  const sessions: Date[] = []

  for (let i = 0, at = start; sessions.length < PREVIEW_SESSIONS && i < 1000; i += 1) {
    if (until && at > until) break
    if (at >= now.startOf('day')) sessions.push(at.toJSDate())
    // Always from the first session, so a monthly class on the 31st does not drift to the 28th.
    at = start.plus(draft.repeats === 'weekly' ? { weeks: i + 1 } : { months: i + 1 })
  }

  return sessions
}

/** What the listing is called before the visitor names it: the CMS fills a blank from the venue. */
export const draftTitle = (draft: ListingDraft): string =>
  draft.title.trim() ||
  (draft.eventType === 'online' ? draft.city?.city : draft.address?.street) ||
  ''

const previewSchedule = (draft: ListingDraft): EventSchedule | null => {
  const patch = draftSchedule(draft)

  if (!patch?.firstDate) return null

  return {
    firstDate: new Date(patch.firstDate),
    firstDate_tz: patch.firstDate_tz,
    endTime: patch.endTime,
    recurrenceType: patch.recurrenceType,
    interval: patch.interval,
    weekdays: patch.weekdays,
    monthlyMode: patch.monthlyMode,
    monthDay: patch.monthDay,
    endingType: patch.endingType,
    untilDate: patch.untilDate ? new Date(patch.untilDate) : null,
    upcomingDates: previewSessions(draft),
  }
}

/**
 * The listing as the draft describes it, in the shape `EventDetails` renders.
 *
 * For a correction the published class is the base, and only the sections the visitor changed
 * are replaced — so an untouched description keeps its formatting and an untouched schedule its
 * real sessions, exactly as Accept would leave them.
 */
export const previewEvent = (
  draft: ListingDraft,
  { path, base }: { path: string; base?: { event: Event; draft: ListingDraft } },
): Event => {
  const patch = draftToPatch(draft)
  const online = draft.eventType === 'online'
  const fresh: Event = {
    id: 0,
    title: draftTitle(draft),
    eventType: draft.eventType,
    languages: draft.languages,
    inactive: false,
    address:
      !online && draft.address
        ? { ...patch.address, mapboxId: draft.address.mapboxId ?? null }
        : null,
    schedule: previewSchedule(draft),
    description: patch.description as LexicalDocument | null,
    images: [],
    contactName: patch.contactName,
    contactPhone: patch.contactPhone,
    website: patch.website,
    registrationMode: 'sahaj-atlas',
    externalRegistrationUrl: null,
    registrationLimit: null,
    registrationsFull: false,
    registrationQuestions: null,
    offersMailingList: null,
    region: draft.city?.city ? { id: 0, slug: '', name: draft.city.city, level: 'city' } : null,
    verificationStage: null,
    webPath: null,
    webUrl: null,
    path,
  }

  if (!base) return fresh

  const before = draftToPatch(base.draft)
  const untouched = (key: keyof ProposedEventPatch) => same(before[key], patch[key])

  return {
    ...base.event,
    title: fresh.title || base.event.title,
    eventType: fresh.eventType,
    languages: fresh.languages,
    contactName: fresh.contactName,
    contactPhone: fresh.contactPhone,
    website: fresh.website,
    address: untouched('address') ? base.event.address : fresh.address,
    schedule: untouched('schedule') ? base.event.schedule : fresh.schedule,
    description: untouched('description') ? base.event.description : fresh.description,
    region:
      untouched('eventType') && same(draft.city, base.draft.city)
        ? base.event.region
        : fresh.region,
    path,
  }
}

// ── The timezone ─────────────────────────────────────────────────────────────────

/** How far a listed class may sit from the picked place and still lend it its zone. */
const NEAREST_ZONE_KM = 300

export type ZonedPoint = { position: Position; timeZone: string }

/**
 * The zone of the nearest listed class, when one sits close to the picked place.
 *
 * A geocoded feature carries no timezone, and the widget ships no zone table. Classes already on
 * the map do carry one, so a place within reach of another class inherits its zone. Anywhere
 * further out keeps the visitor's own zone, which the When step names so they can see it.
 */
export const nearestTimeZone = (
  place: Pick<PickedPlace, 'latitude' | 'longitude'> | null,
  points: readonly ZonedPoint[],
): string | undefined => {
  if (place?.latitude === undefined || place.longitude === undefined) return undefined

  const at: Position = [place.longitude, place.latitude]
  let best: ZonedPoint | undefined
  let bestKm = NEAREST_ZONE_KM

  for (const point of points) {
    const km = distanceKm(at, point.position)

    if (km <= bestKm) {
      best = point
      bestKm = km
    }
  }

  return best?.timeZone
}
