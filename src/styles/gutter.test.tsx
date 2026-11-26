import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import { Button } from '@/components/atoms/Button'
import { DrawerHeader, DrawerToolbar } from '@/components/atoms/Drawer'
import { ListItem } from '@/components/molecules/ListItem'
import { ListToolbar } from '@/components/molecules/ListToolbar'
import { EventHeader } from '@/components/organisms/EventDetails/EventHeader'
import { mockEvent } from '@/mocks/events'
import { tv } from '@/styles/tv'
import { readRepoSource } from '@/test-support/repo-source'

/**
 * The panel has one left and right edge, `--spacing-gutter`. Each band below spells its own
 * inset, so each is a place a title, a row or a toolbar button can drift off that edge.
 */

const firstClasses = (html: string) => (html.match(/class="([^"]*)"/)?.[1] ?? '').split(' ')

describe('the panel gutter', () => {
  it.each([
    ['the drawer header', <DrawerHeader key="h">title</DrawerHeader>],
    [
      "a search field's toolbar",
      <DrawerToolbar key="t" field>
        field
      </DrawerToolbar>,
    ],
    [
      'a list row',
      <MemoryRouter key="r">
        <ListItem count={3} href="/gb" label="United Kingdom" />
      </MemoryRouter>,
    ],
    ['the class page header', <EventHeader key="e" title={mockEvent.title} />],
  ])('insets %s by it', (_, element) => {
    const classes = firstClasses(renderToStaticMarkup(element))

    expect(classes).toContain('px-gutter')
    expect(classes.filter((name) => /^px-\d/.test(name))).toEqual([])
  })

  it("insets the list toolbar by it, less its ghost buttons' own padding", () => {
    const toolbar = firstClasses(renderToStaticMarkup(<ListToolbar>controls</ListToolbar>))
    const button = firstClasses(
      renderToStaticMarkup(
        <Button size="sm" variant="ghost">
          Filters
        </Button>,
      ),
    )
    // This band is the one that reads the gutter through arithmetic rather than by name, and its
    // own padding never moved: 24 − 12 is the `px-3` it replaced. So the class string says
    // nothing on its own — only the subtrahend matching the button it offsets does.
    const steps = Number(button.find((name) => /^px-\d+$/.test(name))?.slice(3))
    const scale = Number(
      readRepoSource('src/styles/globals.css').match(/^\s*--spacing:\s*(\d+)px;/m)?.[1],
    )

    expect(toolbar).toContain(`px-[calc(var(--spacing-gutter)_-_${steps * scale}px)]`)
  })

  it('replaces a slot inset rather than shipping beside it', () => {
    expect(tv({ base: 'px-4' })({ className: 'px-gutter' })).toBe('px-gutter')
  })
})
