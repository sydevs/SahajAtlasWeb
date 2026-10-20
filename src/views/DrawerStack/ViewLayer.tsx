import { type ReactNode } from 'react'
import { motion, useIsPresent } from 'framer-motion'
import clsx from 'clsx'

// One view's layer in the sheet's cross-fade. The outgoing and incoming views overlap for
// the fade, so each fills the sheet absolutely rather than sharing its height.
//
// ⚠ **Not `AnimatePresence mode="popLayout"`.** That pops the outgoing view out of flow with
// a `<style>` element framer-motion appends to `document.head` — the HOST's head, which
// cannot reach into the widget's shadow root (#236). So in every embed both views stayed in
// the flex column for the whole fade, each taking half the panel: the new view flickered in
// halfway down, then jumped to the top. Absolute layers need no stylesheet at all.
//
// The outgoing layer stops taking pointer events and leaves the accessibility tree the
// moment it starts to exit, so a click mid-fade lands on the view it can see arriving.
export function ViewLayer({ children }: { children: ReactNode }) {
  const isPresent = useIsPresent()

  return (
    <motion.div
      animate={{ opacity: 1 }}
      aria-hidden={isPresent ? undefined : true}
      className={clsx('absolute inset-0 flex flex-col', !isPresent && 'pointer-events-none')}
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      {children}
    </motion.div>
  )
}
