import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { Skeleton, SkeletonBlock, SkeletonLine } from './Skeleton'

// Node-only SSR assertions (see `docs/testing.md`).
describe('Skeleton', () => {
  it('hides its shapes from assistive tech, which hear the loading state once, in words', () => {
    const html = renderToStaticMarkup(
      <Skeleton>
        <SkeletonLine />
        <SkeletonBlock />
      </Skeleton>,
    )

    expect(html).toMatch(/^<div aria-hidden="true"/)
  })

  it('stops pulsing under reduced motion', () => {
    const html = renderToStaticMarkup(<Skeleton>x</Skeleton>)

    expect(html).toContain('motion-safe:animate-pulse')
    expect(html).not.toMatch(/(?<![:\w-])animate-pulse/)
  })

  it('takes the text classes of the line it stands for, so it is that line’s height', () => {
    const html = renderToStaticMarkup(
      <SkeletonLine className="text-lg leading-snug" width="w-1/3" />,
    )

    expect(html).toMatch(/^<div class="[^"]*text-lg leading-snug/)
    // A real line box: an empty div with only a short bar inside would be the bar's height.
    expect(html).toContain('\u200b')
    expect(html).toContain('w-1/3')
  })
})
