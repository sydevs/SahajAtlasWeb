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
 * updates.
 *
 * That mattered for the drawers and peek strips, and issue #102 settled it: `providers.tsx`
 * passes `MotionConfig` an explicit `always`/`never` computed from THIS hook, rather than
 * the `reducedMotion="user"` that would have been the obvious spelling — because `"user"`
 * runs on framer's own mount-once read, and would have disagreed with the two live seams
 * beside it (the vaul media query, and mapbox-gl's own check) for the rest of any session
 * in which the viewer flipped the setting. See `.claude/rules/components.md` for the three
 * seams and which one a new animation falls under.
 */
export function usePrefersReducedMotion() {
  return useMediaQuery({ query: '(prefers-reduced-motion: reduce)' })
}
