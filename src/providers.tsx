import { QueryClientProvider } from '@tanstack/react-query'
import { HelmetProvider } from 'react-helmet-async'
import { MotionConfig } from 'framer-motion'
import { StrictMode } from 'react'

import { queryClient } from './config/query-client'
import { usePrefersReducedMotion } from './hooks/use-reduced-motion'

/**
 * One switch for every `motion.*` in the tree — today the peek strips and the
 * drawer-content cross-fade (issue #102). framer reduces an animation by jumping
 * straight to the target values, so the UI still ARRIVES; it just stops travelling.
 *
 * Driven by our own `usePrefersReducedMotion` rather than framer's built-in
 * `reducedMotion="user"`, which reads the media query once at mount and never
 * updates: a viewer who turns the preference on mid-session would keep the motion
 * for the rest of that session, and — worse — would then disagree with the map and
 * the vaul CSS, which are both live. `always`/`never` is the same switch, thrown by
 * a live read, so all three answers move together (`.claude/rules/components.md`).
 */
function ReducedMotion({ children }: { children: React.ReactNode }) {
  const reduce = usePrefersReducedMotion()

  return <MotionConfig reducedMotion={reduce ? 'always' : 'never'}>{children}</MotionConfig>
}

// Radix Primitives are headless and need no provider — links route through
// react-router's own <Link>/useNavigate, and each Radix overlay (Dialog/Select)
// is given a `container` pointing at the widget wrapper so it portals inside the
// brand-themed, light/dark-scoped root rather than to document.body.
export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <HelmetProvider>
          <ReducedMotion>{children}</ReducedMotion>
        </HelmetProvider>
      </QueryClientProvider>
    </StrictMode>
  )
}
