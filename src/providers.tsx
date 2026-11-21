import { QueryClientProvider } from '@tanstack/react-query'
import { HelmetProvider } from 'react-helmet-async'
import { LazyMotion, MotionConfig, domMin } from 'framer-motion'
import { StrictMode } from 'react'

import { queryClient } from './config/query-client'
import { usePrefersReducedMotion } from './hooks/use-reduced-motion'

/**
 * One switch for every `m.*` in the tree — today the peek strips and the
 * drawer-content cross-fade (issue #102). framer reduces an animation by jumping
 * straight to the target values, so the UI still ARRIVES; it just stops travelling.
 *
 * Driven by our own `usePrefersReducedMotion` rather than framer's built-in
 * `reducedMotion="user"`, which reads the media query once at mount and never
 * updates: a viewer who turns the preference on mid-session would keep the motion
 * for the rest of that session, and — worse — would then disagree with the map and
 * the vaul CSS, which are both live. `always`/`never` is the same switch, thrown by
 * a live read, so all three answers move together (`src/components/AGENTS.md`).
 */
function ReducedMotion({ children }: { children: React.ReactNode }) {
  const reduce = usePrefersReducedMotion()

  return <MotionConfig reducedMotion={reduce ? 'always' : 'never'}>{children}</MotionConfig>
}

/**
 * All of framer-motion this app ships. An `m.*` component draws its engine from here, where a
 * `motion.*` one bundles every feature the library has: 17.5 KiB gz more in the eager graph,
 * for drag and layout projection nothing uses.
 *
 * ⚠ **`domMin` is `initial`, `animate`, `exit` and `transition`, and nothing else.** A
 * `whileHover`, `drag` or `layout` prop renders and does nothing. Move to `domAnimation` or
 * `domMax` in the change that needs one.
 *
 * ⚠ **An `m.*` with no `LazyMotion` above it never leaves its `initial` values**, so one
 * entering from `opacity: 0` stays invisible, and has no exit to play. Both entries and Ladle
 * mount `Providers`, and `ViewLayer.test.tsx` mounts through it to hold this wiring.
 */
const MOTION_FEATURES = domMin

// Radix Primitives are headless and need no provider — links route through
// react-router's own <Link>/useNavigate, and each Radix overlay (Dialog/Select)
// is given a `container` pointing at the widget wrapper so it portals inside the
// brand-themed, light/dark-scoped root rather than to document.body.
export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <HelmetProvider>
          <LazyMotion strict features={MOTION_FEATURES}>
            <ReducedMotion>{children}</ReducedMotion>
          </LazyMotion>
        </HelmetProvider>
      </QueryClientProvider>
    </StrictMode>
  )
}
