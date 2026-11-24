import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import { DrawerHeader } from '@/components/atoms/Drawer'
import { ListItem } from '@/components/molecules/ListItem'
import { ListToolbar } from '@/components/molecules/ListToolbar'
import { EventHeader } from '@/components/organisms/EventDetails/EventHeader'
import { mockEvent } from '@/mocks/events'
import { readSourceWithoutComments } from '@/test-support/source-tree'

/**
 * The panel has one left and right edge, `--spacing-gutter`. The header, the list rows and the
 * class page each drew their own (16, 24 and 24px), so a title, a row and a toolbar button
 * started at three distances from the side. Each band below is one place that drifted.
 */

const firstClasses = (html: string) => (html.match(/class="([^"]*)"/)?.[1] ?? '').split(' ')

describe('the panel gutter', () => {
  it('is one token in the theme', () => {
    expect(readSourceWithoutComments('styles/globals.css')).toMatch(/--spacing-gutter:\s*24px;/)
  })

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
})
