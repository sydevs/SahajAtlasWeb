import { useMediaQuery } from 'react-responsive'

/**
 * This checks whether this viewer wants motion kept to a minimum.
 *
 * This is the repo's first reduced-motion support. See issue #104.
 * It is deliberately built on `react-responsive`, the media-query mechanism `src/config/responsive.ts` already uses, instead of a hand-rolled `matchMedia` subscription.
 * That choice buys two properties for free.
 * It is LIVE: a viewer who turns the preference on mid-session sees the motion settle, instead of waiting for an unrelated re-render.
 * It also never touches `window`, so the node unit lane renders it as "motion is allowed," instead of throwing.
 * Hand-rolling it would also have skipped the environment guarding the widget wants.
 * This widget ships into arbitrary host pages, and a read that throws during render takes the surrounding UI down with it.
 *
 * This is NOT framer-motion's `useReducedMotion`, despite that already being a dependency.
 * That hook reads the preference ONCE at mount, through `useState(prefersReducedMotion.current)`, and never updates.
 *
 * That mattered for the drawers and peek strips, and issue #102 settled it.
 * `providers.tsx` passes `MotionConfig` an explicit `always` or `never` value, computed from THIS hook.
 * It does not pass `reducedMotion="user"`, which would have been the obvious spelling.
 * `"user"` runs on framer's own mount-once read.
 * It would have disagreed with the two live seams beside it, the vaul media query and mapbox-gl's own check, for the rest of any session in which the viewer flipped the setting.
 * See `src/components/AGENTS.md` for the three seams and which one a new animation falls under.
 */
export function usePrefersReducedMotion() {
  return useMediaQuery({ query: '(prefers-reduced-motion: reduce)' })
}
