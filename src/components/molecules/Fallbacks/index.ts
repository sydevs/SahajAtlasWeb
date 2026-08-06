// Only what is actually consumed outside this folder. The policy table, the narrowing
// function, the action row, the region wrapper and the display hooks are deliberately NOT
// here: each is a licence for a future view to read the table and hand-roll its own panel,
// which is the drift the unification exists to remove (DESIGN_SYSTEM.md — "single-use
// internals are NOT exported"). The co-located tests and stories reach them by module path.
export {
  LoadingFallback,
  ErrorFallback,
  FallbackPanel,
  ResetErrorBoundary,
  CENTERED_BODY,
} from './Fallbacks'
export type { FallbackAlign, FallbackKind } from './Fallbacks'
