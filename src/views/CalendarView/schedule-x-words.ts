import type { TFunction } from 'i18next'

type Vars = { n?: number; date?: string }

// The singular keys carry no `n`.
const more = (t: TFunction, { n = 1 }: Vars) => t('calendar.more', { count: n })
// A spoken name starts with the words on screen, so the button is named by its own text.
const moreOn = (t: TFunction, vars: Vars) => `${more(t, vars)}, ${vars.date}`

// Schedule-X's own words for what it lists, in ours and in every language: "+ 3 classes", not
// "+ 3 events". The patched core asks this before its own table (`src/components/AGENTS.md`
// § Patch register), and a key missing here keeps Schedule-X's wording.
export const SCHEDULE_X_WORDS: Record<string, (t: TFunction, vars: Vars) => string> = {
  '+ 1 event': more,
  '+ {{n}} events': more,
  'Link to 1 more event on {{date}}': moreOn,
  'Link to {{n}} more events on {{date}}': moreOn,
  'No events': (t) => t('calendar.none'),
}

/** The `translations` the patched Schedule-X core asks first. */
export const scheduleXWords = (t: TFunction) => ({
  sydevs: (key: string, vars: Vars) => SCHEDULE_X_WORDS[key]?.(t, vars),
})
