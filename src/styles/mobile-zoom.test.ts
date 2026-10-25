import ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { readRepoSource } from '@/test-support/repo-source'
import { parseSource } from '@/test-support/source-ast'
import { readSource, sourceFiles } from '@/test-support/source-tree'

/**
 * Both halves of #322, which are one bug seen from two ends: a reader on a phone could not
 * magnify the standalone page, and tapping any field magnified it for them whether they asked
 * or not.
 *
 * The second half is the one an enumeration has to hold. iOS Safari scales the whole page in
 * when a focused text field computes under 16px, and embedded there is no way back out — the
 * host's page is left scaled, and nothing of ours is in a position to undo it. So the floor has
 * to hold for every field in the app, not for the two a ticket happened to name, and a field
 * added later is exactly how it stops holding.
 */

/** 16px, written in px like every other length here (`src/AGENTS.md`). */
const ZOOM_FLOOR = /text-\[16px\]/

/** The shared field recipe carries the floor for everything built on it. */
const ON_THE_RECIPE = /fieldChrome\(/

/**
 * Tags that render a focusable text field.
 *
 * `CommandInput` is cmdk's, and the Combobox's real text entry — the Radix trigger beside it is
 * a button. Our own `Input` and `Textarea` atoms are absent on purpose: they are `<input>` and
 * `<textarea>` in this list already, through their own files.
 */
const FIELD_TAGS = ['input', 'textarea', 'select', 'CommandInput']

/** `type`s that take no typing, so focusing one zooms nothing. */
const NON_TEXT_TYPES = [
  'button',
  'checkbox',
  'color',
  'file',
  'hidden',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
]

type Field = { path: string; tag: string; className: string }

const attribute = (element: ts.JsxOpeningLikeElement, name: string) =>
  element.attributes.properties.find(
    (property): property is ts.JsxAttribute =>
      ts.isJsxAttribute(property) && property.name.getText() === name,
  )

// Parsed rather than grepped, for the reason `href.test.ts` gives: every cheap way of stripping
// comments from the raw text has a false pass in it, and a hidden field is what this must find.
const fieldsIn = (path: string): Field[] => {
  const parsed = parseSource(path)
  const found: Field[] = []

  const visit = (node: ts.Node): void => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(parsed)

      if (FIELD_TAGS.includes(tag)) {
        const type = attribute(node, 'type')?.initializer
        const literalType = type && ts.isStringLiteral(type) ? type.text : undefined

        // An expression for `type` is unreadable from here, so it counts as text entry.
        if (!literalType || !NON_TEXT_TYPES.includes(literalType)) {
          found.push({
            path,
            tag,
            className: attribute(node, 'className')?.initializer?.getText(parsed) ?? '',
          })
        }
      }
    }

    ts.forEachChild(node, visit)
  }

  ts.forEachChild(parsed, visit)

  return found
}

describe('every field clears the 16px iOS zoom floor', () => {
  const fields = sourceFiles({ extensions: ['.tsx'] }).flatMap(fieldsIn)

  it('finds the app fields to check (the walk itself must not silently break)', () => {
    // Blind spots, stated because a guard that oversells itself is worse than none: a field
    // rendered by a component not in `FIELD_TAGS`, one built with `React.createElement`, and a
    // third-party control styling its own input. The geocoder is that last case, pinned below.
    // Schedule-X's `.sx__date-input` is the other, measured at 14px — inert only because
    // `globals.css` hides the whole `.sx__calendar-header` it sits in, so un-hiding that header
    // puts a zooming field back on screen that nothing here would catch.
    expect(fields.length).toBeGreaterThanOrEqual(6)
  })

  it('has each one on the recipe or carrying the floor itself', () => {
    const under = fields.filter(
      ({ className }) => !ZOOM_FLOOR.test(className) && !ON_THE_RECIPE.test(className),
    )

    // A field here computes under 16px below `md`. Put it on `fieldChrome`
    // (`atoms/Select`), or give it `text-[16px] md:text-sm`. Adding a `type` to the
    // exempt list instead is only right for a control nobody types into.
    expect(under.map(({ path, tag }) => `${path} <${tag}>`)).toEqual([])
  })
})

describe('the two places the floor is reached from outside a field', () => {
  it('has fieldChrome at 16px below md, and the 13px scale above it', () => {
    const recipe = readSource('components/atoms/Select/Select.tsx')

    expect(recipe).toMatch(ZOOM_FLOOR)
    // Without this the whole app's fields grow by 3px on a desktop too, which the ticket
    // separated out as a design question rather than part of the fix.
    expect(recipe).toContain('md:text-sm')
  })

  it("overrides the geocoder's own input, which our classes cannot otherwise reach", () => {
    // `@mapbox/search-js-web` gives its input `font: inherit` from a container it sizes from
    // `themes.ts`'s `unit` — the control's whole spacing scale, so raising that would resize
    // the suggestion list and truncate the placeholder. The override is on the wrapper, and
    // `!` is load-bearing: the library's sheet and ours land at equal specificity.
    expect(readSource('components/organisms/Mapbox/MapSearch.tsx')).toContain(
      'max-md:[&_input]:!text-[16px]',
    )
  })
})

describe('the standalone viewport meta', () => {
  // Comments stripped first, the same reason `source-tree.ts` strips them from a module: the
  // tag's own comment has to be free to name the two values it refuses, and this check reads
  // markup rather than prose.
  const shell = readRepoSource('index.html').replace(/<!--[\s\S]*?-->/g, '')

  it('pins neither the scale nor scalability', () => {
    expect(shell).not.toMatch(/user-scalable/)
    expect(shell).not.toMatch(/maximum-scale/)
  })

  it('is one tag, so no second one can reintroduce either', () => {
    // There were two, and the one further down the document won. The surviving pair of values
    // was therefore not what either tag read on its own.
    const tags = shell.match(/<meta[^>]*name="viewport"/g) ?? []

    expect(tags).toHaveLength(1)
    expect(shell).toContain('width=device-width')
  })
})
