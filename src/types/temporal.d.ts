import type { Temporal as Polyfill } from 'temporal-polyfill'

// Schedule-X's own types name a global `Temporal` and declare none, so without this every date
// it takes or hands back is `any`. The declarations are the polyfill's; only the name is ours.
// ⚠ Dropping `export` makes the alias local to the block, and the global namespace vanishes.
// ⚠ Type-only, so `Temporal.Now` stays a compile error: at runtime there is no global, by
// design (CalendarView imports the module).
declare global {
  export import Temporal = Polyfill
}
