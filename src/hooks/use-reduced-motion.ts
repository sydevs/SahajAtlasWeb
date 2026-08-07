import { useMediaQuery } from 'react-responsive'

/**
 * Does this viewer want motion kept to a minimum?
 *
 * The repo's first reduced-motion support (issue #104), and deliberately built on
 * `react-responsive` — the media-query mechanism `src/config/responsive.ts` already uses —
 * rather than a hand-rolled `matchMedia` subscription. That buys the two properties this
 * needs for free: it is LIVE (a viewer who turns the preference on mid-session sees the
 * motion settle, rather than waiting for an unrelated re-render), and it never touches
 * `window`, so the node unit lane renders it as "motion is allowed" instead of throwing.
 * Hand-rolling it would also have skipped the environment guarding the widget wants —
 * this ships into arbitrary host pages, and a read that throws during render takes the
 * surrounding UI down with it.
 *
 * NOT framer-motion's `useReducedMotion`, despite that already being a dependency: it
 * reads the preference ONCE at mount (`useState(prefersReducedMotion.current)`) and never
 * updates. Worth knowing because the remaining reduced-motion surfaces in the readiness
 * report — the drawers and peek strips — are framer-motion animations whose natural fix
 * is a single `<MotionConfig reducedMotion="user">` in `providers.tsx`. That is the right
 * fix for them, but it runs on the non-reactive read, so the two answers can disagree for
 * the rest of a session in which the viewer flips the setting. Whoever lands it should
 * decide whether to close that gap rather than discover it.
 */
export function usePrefersReducedMotion() {
  return useMediaQuery({ query: '(prefers-reduced-motion: reduce)' })
}
