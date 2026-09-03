import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, it, expect } from 'vitest'

import {
  AgnosticFeedEventSchema,
  EventDocSchema,
  EventSchema,
  EventSlimSchema,
  EventTitleSchema,
  FeedEventSchema,
  REGISTRATION_QUESTION_NAMES,
  RegistrationQuestionNameSchema,
  RegistrationQuestionsSchema,
} from './event'

import { mockEvent, mockEventSlim, mockEventSlimList } from '@/mocks/events'

// The fetchers parse every response through these schemas (src/config/api/fetch.ts),
// so a SahajCloud shape change should surface here as a parse error, not a runtime
// crash deep in the UI. We reuse the Ladle mocks (typed against the same schemas)
// as the happy-path fixtures and add a raw-wire payload to prove date coercion.

describe('EventSlimSchema', () => {
  it('parses the slim list fixtures', () => {
    expect(EventSlimSchema.array().parse(mockEventSlimList)).toHaveLength(mockEventSlimList.length)
  })

  it('coerces ISO date strings in the schedule into Date objects', () => {
    const parsed = EventSlimSchema.parse({
      ...mockEventSlim,
      schedule: {
        firstDate: '2026-01-10T09:30:00Z',
        firstDate_tz: 'Europe/London',
        upcomingDates: ['2026-07-04T09:30:00Z'],
      },
    })

    expect(parsed.schedule?.firstDate).toBeInstanceOf(Date)
    expect(parsed.schedule?.upcomingDates?.[0].toISOString()).toBe('2026-07-04T09:30:00.000Z')
  })

  it('rejects an unknown recurrence type', () => {
    expect(() =>
      EventSlimSchema.parse({
        ...mockEventSlim,
        schedule: { ...mockEventSlim.schedule, recurrenceType: 'FORTNIGHTLY' },
      }),
    ).toThrow()
  })

  it('rejects an unknown event type', () => {
    expect(() => EventSlimSchema.parse({ ...mockEventSlim, eventType: 'hybrid' })).toThrow()
  })
})

describe('FeedEventSchema', () => {
  it('parses a feed event (the geojson feature properties), dropping derived fields', () => {
    const parsed = FeedEventSchema.parse(mockEventSlim)

    expect(parsed.id).toBe(mockEventSlim.id)
    expect('path' in parsed).toBe(false)
  })
})

describe('AgnosticFeedEventSchema', () => {
  it('parses agnostic feed properties and strips the localized title', () => {
    const parsed = AgnosticFeedEventSchema.parse({
      id: 1,
      title: 'stripped',
      eventType: 'offline',
      languages: ['en'],
      region: { id: 9, slug: 'brussels', level: 'city' },
    })

    expect('title' in parsed).toBe(false)
    expect(parsed.eventType).toBe('offline')
    expect(parsed.region.slug).toBe('brussels')
  })
})

describe('EventTitleSchema', () => {
  it('parses an id→title sliver row', () => {
    expect(EventTitleSchema.parse({ id: 5, title: 'Class' })).toEqual({ id: 5, title: 'Class' })
  })

  it('tolerates a null title so one bad row cannot fail the whole titles read', () => {
    expect(EventTitleSchema.parse({ id: 6, title: null }).title).toBeNull()
  })
})

describe('EventSchema', () => {
  it('parses the full event fixture (schedule / region / images / description)', () => {
    const parsed = EventSchema.parse(mockEvent)

    expect(parsed.id).toBe(mockEvent.id)
    expect(parsed.region.slug).toBe('cambridge')
  })

  it('rejects a missing required field', () => {
    expect(() => EventSchema.parse({ ...mockEvent, title: undefined })).toThrow()
  })
})

describe('EventDocSchema images', () => {
  // The real wire shape: `getEvent` selects `filename` (so SahajCloud's virtual
  // `url` resolves) and the dev backend returns a relative `url`. `filename` is
  // not part of the schema — it's dropped — and `url` is retained as-is.
  it('parses an image with filename + relative url, keeping url and dropping filename', () => {
    const parsed = EventDocSchema.parse({
      ...mockEvent,
      images: [
        { id: 2, filename: 'picture-9.jpg', url: '/api/images/file/picture-9.jpg', alt: 'Hall' },
      ],
    })

    expect(parsed.images[0].url).toBe('/api/images/file/picture-9.jpg')
    expect(parsed.images[0]).not.toHaveProperty('filename')
    expect(parsed.images[0].alt).toBe('Hall')
  })

  it('tolerates a null image url so a file-less image cannot crash the event read', () => {
    const parsed = EventDocSchema.parse({
      ...mockEvent,
      images: [{ id: 3, url: null, alt: 'no file' }],
    })

    expect(parsed.images[0].url).toBeNull()
  })
})

describe('registration question names', () => {
  // The key set is derived from the synced CMS types; this pins the concrete list so
  // a `pnpm types:cms` resync that changes SahajCloud's EVENT_REGISTRATION_QUESTIONS
  // surfaces here (alongside the compile-time `satisfies` guard on the schema).
  it('exposes the EVENT_REGISTRATION_QUESTIONS key set, in schema order', () => {
    expect(REGISTRATION_QUESTION_NAMES).toEqual([
      'experience',
      'referral',
      'aspirations',
      'questions',
    ])
  })

  it('validates a known question name and rejects an unknown one', () => {
    expect(RegistrationQuestionNameSchema.parse('aspirations')).toBe('aspirations')
    expect(() => RegistrationQuestionNameSchema.parse('priorExperience')).toThrow()
  })

  // The #191 regression, at the seam that hid it. `RegistrationQuestionsSchema` is a
  // plain `z.object`, so zod STRIPS a key it does not declare rather than raising —
  // a schema naming the pre-rename questions parsed `{aspirations: true}` to `{}`,
  // and every event rendered an empty form with nothing anywhere reporting a problem.
  // Assert the enabled key SURVIVES the parse, not merely that the parse succeeds:
  // a `.toBeDefined()` on the result would pass against the stale schema too.
  it('keeps an enabled CMS question through the parse, rather than stripping it', () => {
    const parsed = RegistrationQuestionsSchema.parse({ aspirations: true, experience: false })

    expect(parsed.aspirations).toBe(true)
    expect(parsed.experience).toBe(false)
  })

  // The whole chain RegistrationView walks: parse the CMS payload, then filter the
  // derived name list by it. This is the assertion that reads `[]` when the schema
  // and the CMS disagree, whatever the disagreement is.
  it('resolves the questions a CMS payload enables, in schema order', () => {
    const questions = RegistrationQuestionsSchema.parse({ questions: true, referral: true })

    expect(REGISTRATION_QUESTION_NAMES.filter((name) => questions[name])).toEqual([
      'referral',
      'questions',
    ])
  })

  // Every question renders its label from `events:questions.<name>`, so a bundle key
  // outside the CMS set is copy nothing can reach and a missing one is a raw key on
  // screen. Both directions, over every locale — `en` carried five unreachable keys
  // for the whole of #191, which is what made the rename look already-adopted.
  it('gives every locale bundle exactly the CMS question keys', () => {
    const localesDir = fileURLToPath(new URL('../../public/locales', import.meta.url))
    const expected = [...REGISTRATION_QUESTION_NAMES].sort()

    const languages = readdirSync(localesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)

    expect(languages.length).toBeGreaterThan(0)

    for (const language of languages) {
      const bundle = JSON.parse(
        readFileSync(`${localesDir}/${language}/events.json`, 'utf8'),
      ) as Record<string, Record<string, string>>

      expect(
        Object.keys(bundle.questions).sort(),
        `public/locales/${language}/events.json`,
      ).toEqual(expected)
    }
  })
})
