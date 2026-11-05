import { type ReactNode, useEffect, useRef } from 'react'
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
//
// With `onHeight`, the layer hugs its content where the panel floats (≥lg) instead of filling
// the sheet: it sizes to what's inside, up to the room available, and reports that height so the
// panel can follow. The outgoing layer stops reporting, so the panel takes the arriving view's
// height.
export function ViewLayer({
  children,
  onHeight,
}: {
  children: ReactNode
  onHeight?: (height: number) => void
}) {
  const isPresent = useIsPresent()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = ref.current

    if (!onHeight || !isPresent || !element || typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(() => onHeight(element.offsetHeight))

    observer.observe(element)

    return () => observer.disconnect()
  }, [onHeight, isPresent])

  return (
    <motion.div
      ref={ref}
      animate={{ opacity: 1 }}
      aria-hidden={isPresent ? undefined : true}
      className={clsx(
        'absolute inset-0 flex flex-col',
        onHeight &&
          'lg:bottom-auto lg:max-h-[calc(var(--sy-panel-room,100dvh)-2px)] lg:[&>*]:flex-[0_1_auto]',
        !isPresent && 'pointer-events-none',
      )}
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      {children}
    </motion.div>
  )
}
