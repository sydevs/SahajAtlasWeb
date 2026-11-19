import type { Temporal as Polyfill } from 'temporal-polyfill'

// Schedule-X's own types name a global `Temporal`, which this project's `lib` does not declare.
// Without this, every date it takes or hands back is `any`, and a string passed to `setDate`
// compiles.
// ⚠ Types only, so `Temporal.Now` stays a compile error: at runtime there is no global, by
// design (CalendarView imports the module).
declare global {
  namespace Temporal {
    type PlainDate = Polyfill.PlainDate
    type ZonedDateTime = Polyfill.ZonedDateTime
  }
}
