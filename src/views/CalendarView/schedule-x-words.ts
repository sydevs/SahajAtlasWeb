import type { TFunction } from 'i18next'

// Schedule-X's own words for what it lists, in ours and in every language: "+ 3 classes", not
// "+ 3 events". The patched core asks this before its own table (`src/components/AGENTS.md`
// § Patch register), and a key missing here keeps Schedule-X's wording.
const SCHEDULE_X_WORDS: Record<string, (t: TFunction, vars: Record<string, unknown>) => string> = {
  '+ 1 event': (t) => t('calendar.more', { count: 1 }),
  '+ {{n}} events': (t, { n }) => t('calendar.more', { count: Number(n) }),
  // A spoken name starts with the words on screen, so the button is named by its own text.
  'Link to 1 more event on {{date}}': (t, { date }) =>
    `${t('calendar.more', { count: 1 })}, ${String(date)}`,
  'Link to {{n}} more events on {{date}}': (t, { n, date }) =>
    `${t('calendar.more', { count: Number(n) })}, ${String(date)}`,
  'No events': (t) => t('calendar.none'),
}

/** The `translations` the patched Schedule-X core asks first. */
export const scheduleXWords = (t: TFunction) => ({
  sydevs: (key: string, vars: Record<string, unknown>) => SCHEDULE_X_WORDS[key]?.(t, vars),
})
