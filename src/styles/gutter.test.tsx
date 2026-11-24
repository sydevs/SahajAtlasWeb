import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import { DrawerHeader } from '@/components/atoms/Drawer'
import { ListItem } from '@/components/molecules/ListItem'
import { ListToolbar } from '@/components/molecules/ListToolbar'
import { EventHeader } from '@/components/organisms/EventDetails/EventHeader'
import { mockEvent } from '@/mocks/events'
import { tv } from '@/styles/tv'

/**
 * The panel has one left and right edge, `--spacing-gutter`. Each band below spells its own
 * inset, so each is a place a title, a row or a toolbar button can drift off that edge.
 */

const firstClasses = (html: string) => (html.match(/class="([^"]*)"/)?.[1] ?? '').split(' ')

describe('the panel gutter', () => {
  it.each([
    ['the drawer header', <DrawerHeader key="h">title</DrawerHeader>],
    [
      'a list row',
      <MemoryRouter key="r">
        <ListItem count={3} href="/gb" label="United Kingdom" />
      </MemoryRouter>,
    ],
    ['the class page header', <EventHeader key="e" event={mockEvent} />],
  ])('insets %s by it', (_, element) => {
    const classes = firstClasses(renderToStaticMarkup(element))

    expect(classes).toContain('px-gutter')
    expect(classes.filter((name) => /^px-\d/.test(name))).toEqual([])
  })

  it("insets the list toolbar by it, less its ghost buttons' own 12px", () => {
    const classes = firstClasses(renderToStaticMarkup(<ListToolbar>controls</ListToolbar>))

    expect(classes).toContain('px-[calc(var(--spacing-gutter)_-_12px)]')
  })

  it('replaces a slot inset rather than shipping beside it', () => {
    expect(tv({ base: 'px-4' })({ className: 'px-gutter' })).toBe('px-gutter')
  })
})
