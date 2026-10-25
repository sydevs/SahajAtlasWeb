import type { ListingDraft, ListingErrors, ListingSection } from '@/lib/proposal'

import { DateTime } from 'luxon'

import { stepErrors } from '@/lib/proposal'

/**
 * The one-question-at-a-time flow (#147, direction C), as pure data: which questions a visitor
 * is asked, in what order, and when each may be left. The panel and the progress bar both read
 * this, so they cannot disagree about where the visitor is.
 */

/** Every screen the flow can show. `review` ends both flows; `changed` opens a correction. */
export type Question =
  | 'mode'
  | 'link'
  | 'place'
  | 'often'
  | 'day'
  | 'time'
  | 'language'
  | 'contact'
  | 'about'
  | 'changed'
  | 'stopped'
  | 'note'
  | 'review'

/** What a correction says is wrong, which decides the questions it asks. */
export type CorrectionReason = 'time' | 'place' | 'contact' | 'stopped' | 'other'

export const CORRECTION_REASONS: readonly CorrectionReason[] = [
  'time',
  'place',
  'contact',
  'stopped',
  'other',
]

/** Where an online class is joined from needs its own screen; an in-person one does not. */
const placeQuestions = (draft: ListingDraft): Question[] =>
  draft.eventType === 'online' ? ['mode', 'link', 'place'] : ['mode', 'place']

const scheduleQuestions: Question[] = ['often', 'day', 'time']

/** A new listing's questions, in the order they are asked. */
export const addQuestions = (draft: ListingDraft): Question[] => [
  ...placeQuestions(draft),
  ...scheduleQuestions,
  'language',
  'contact',
  'about',
  'review',
]

/** A correction's questions: "what's changed?", only the questions that answer it, then review. */
export const correctionQuestions = (
  draft: ListingDraft,
  reason: CorrectionReason | null,
): Question[] => {
  const branch: Record<CorrectionReason, Question[]> = {
    time: scheduleQuestions,
    place: placeQuestions(draft),
    contact: ['contact'],
    stopped: ['stopped'],
    other: ['note'],
  }

  return ['changed', ...(reason ? branch[reason] : []), 'review']
}

/** The correction answer a question belongs to, so an Edit from review re-enters its branch. */
export const reasonFor = (question: Question): CorrectionReason | null => {
  if (question === 'often' || question === 'day' || question === 'time') return 'time'
  if (question === 'mode' || question === 'link' || question === 'place') return 'place'
  if (question === 'contact') return 'contact'
  if (question === 'stopped') return 'stopped'
  if (question === 'note') return 'other'

  return null
}

/** The questions the visitor is walking through right now. */
export const flowQuestions = (
  draft: ListingDraft,
  correction: { reason: CorrectionReason | null } | null,
): Question[] => (correction ? correctionQuestions(draft, correction.reason) : addQuestions(draft))

/** Where a flow opens: the first question of a new listing, or "what's changed?". */
export const firstQuestion = (isCorrection: boolean): Question =>
  isCorrection ? 'changed' : 'mode'

/** How far along `question` is, from 0 to 1, for the progress bar. */
export const questionProgress = (questions: Question[], question: Question): number => {
  const index = questions.indexOf(question)

  if (index < 0 || questions.length < 2) return 0

  return index / (questions.length - 1)
}

/** The question after `question`, or `review` when it is the last one asked. */
export const nextQuestion = (questions: Question[], question: Question): Question =>
  questions[questions.indexOf(question) + 1] ?? 'review'

/** The question before `question`, or null on the first. */
export const previousQuestion = (questions: Question[], question: Question): Question | null => {
  const index = questions.indexOf(question)

  return index > 0 ? questions[index - 1] : null
}

/** The listing section a question fills in, so review's Edit links can return to it. */
export const SECTION_QUESTION: Record<ListingSection, Question> = {
  where: 'place',
  when: 'often',
  contact: 'contact',
  about: 'about',
  more: 'language',
}

/** The fields each question answers for, as `stepErrors` reports them. */
const QUESTION_STEP: Partial<Record<Question, Parameters<typeof stepErrors>[0]>> = {
  link: 'where',
  place: 'where',
  contact: 'contact',
  about: 'more',
}

/**
 * What stops `question` from moving on. A link and a place are checked apart, so the link screen
 * does not complain about a city that is the next screen's job.
 */
export const questionErrors = (
  question: Question,
  draft: ListingDraft,
  base?: ListingDraft | null,
): ListingErrors => {
  if (question === 'day') {
    const errors = stepErrors('when', draft, base)

    return errors.firstDate ? { firstDate: true } : {}
  }
  if (question === 'time') {
    const errors = stepErrors('when', draft, base)

    return errors.startTime ? { startTime: true } : {}
  }

  const step = QUESTION_STEP[question]

  if (!step) return {}

  const errors = stepErrors(step, draft, base)

  if (question === 'link') return errors.onlineUrl ? { onlineUrl: true } : {}
  if (question === 'place') {
    const place = { ...errors }

    delete place.onlineUrl

    return place
  }

  return errors
}

// ── Days and dates ───────────────────────────────────────────────────────────────

/** ISO weekday, Monday = 1 … Sunday = 7, the way luxon numbers them. */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7

export const ISO_WEEKDAYS: readonly IsoWeekday[] = [1, 2, 3, 4, 5, 6, 7]

/**
 * The first date a weekly class on `weekday` meets: today when today is that day, otherwise the
 * next one. Hosts think "every Tuesday", so the flow asks for the day and works the date out.
 */
export const nextDateOn = (
  weekday: IsoWeekday,
  timeZone: string,
  now: DateTime = DateTime.now(),
): string => {
  const today = now.setZone(timeZone).startOf('day')
  const ahead = (weekday - today.weekday + 7) % 7

  return today.plus({ days: ahead }).toISODate() ?? ''
}

/** The weekday a `YYYY-MM-DD` date falls on, or null for a malformed one. */
export const weekdayOf = (date: string): IsoWeekday | null => {
  const parsed = DateTime.fromISO(date)

  return parsed.isValid ? (parsed.weekday as IsoWeekday) : null
}

/** `HH:MM` plus `minutes`, wrapping past midnight — "an hour later" for the end-time picks. */
export const addMinutes = (time: string, minutes: number): string => {
  const [hours, mins] = time.split(':').map(Number)

  if (!Number.isFinite(hours) || !Number.isFinite(mins)) return ''

  const total = (((hours * 60 + mins + minutes) % 1440) + 1440) % 1440

  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

/** Minutes from `start` to `end`, the next day when `end` is earlier (an overnight session). */
export const minutesBetween = (start: string, end: string): number | null => {
  const toMinutes = (time: string) => {
    const [hours, mins] = time.split(':').map(Number)

    return Number.isFinite(hours) && Number.isFinite(mins) ? hours * 60 + mins : null
  }
  const from = toMinutes(start)
  const to = toMinutes(end)

  if (from === null || to === null) return null

  return (to - from + 1440) % 1440
}
