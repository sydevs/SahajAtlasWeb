import ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { readRepoSource } from '@/test-support/repo-source'
import { parseSource } from '@/test-support/source-ast'
import { readSourceWithoutComments, sourceFiles } from '@/test-support/source-tree'

/**
 * iOS Safari scales the whole page in when a focused text field computes under 16px, and
 * embedded there is no way back out — the host's page is left scaled, and nothing of ours is in
 * a position to undo it (#322). So the floor has to hold for every field in the app, not for the
 * two a ticket happened to name, and a field added later is how it stops holding.
 */

const ZOOM_FLOOR = /text-\[16px\]/

const ON_THE_RECIPE = /fieldChrome\(/

/**
 * Tags that render a focusable text field.
 *
 * `CommandInput` is cmdk's, and the Combobox's real text entry — the Radix trigger beside it is
 * a button. Our own `Input` and `Textarea` atoms are absent on purpose: they are the `<input>`
 * and `<textarea>` in this list already, through their own files.
 */
const FIELD_TAGS = ['input', 'textarea', 'select', 'CommandInput']

/** `type`s that take no typing, so focusing one zooms nothing. */
const NON_TEXT_TYPES = ['checkbox', 'radio']

type Field = { path: string; tag: string; className: string }

const label = ({ path, tag }: Field) => `${path} <${tag}>`

const attribute = (element: ts.JsxOpeningLikeElement, name: string, source: ts.SourceFile) =>
  element.attributes.properties.find(
    (property): property is ts.JsxAttribute =>
      ts.isJsxAttribute(property) && property.name.getText(source) === name,
  )

// Read per element, not per file: a regex cannot reliably tie a `className` to the opening tag it
// belongs to across multiline JSX, so a file-level match would pass a file whose SECOND field
// lacks the floor.
const fieldsIn = (path: string): Field[] => {
  const parsed = parseSource(path)
  const found: Field[] = []

  const visit = (node: ts.Node): void => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(parsed)

      if (FIELD_TAGS.includes(tag)) {
        const type = attribute(node, 'type', parsed)?.initializer
        const literalType = type && ts.isStringLiteral(type) ? type.text : undefined

        // An expression for `type` is unreadable from here, so it counts as text entry.
        if (!literalType || !NON_TEXT_TYPES.includes(literalType)) {
          found.push({
            path,
            tag,
            className: attribute(node, 'className', parsed)?.initializer?.getText(parsed) ?? '',
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
  const sources = sourceFiles({ extensions: ['.tsx'] })
  const fields = sources.flatMap(fieldsIn)

  /**
   * Two blind spots, since a guard that oversells itself is worse than none. A field rendered by
   * a component not in `FIELD_TAGS` is invisible here — the geocoder is that case, pinned below.
   * So is Schedule-X's `.sx__date-input`, measured at 14px and inert only because `globals.css`
   * hides the `.sx__calendar-header` it sits in: un-hiding that header puts a zooming field back
   * on screen that nothing here would catch.
   */
  const INVENTORY = [
    'components/atoms/Combobox/Combobox.tsx <CommandInput>',
    'components/atoms/Input/Input.tsx <input>',
    'components/atoms/Textarea/Textarea.tsx <textarea>',
    'components/organisms/Mapbox/MapSearch.tsx <input>',
    'components/organisms/RegistrationForm/RegistrationForm.tsx <input>',
    'components/organisms/RegistrationForm/RegistrationForm.tsx <textarea>',
    'views/CalendarView/CalendarView.tsx <input>',
    'views/fallbacks.tsx <input>',
  ]

  it('finds source files to scan (the walk itself must not silently break)', () => {
    expect(sources.length).toBeGreaterThan(50)
  })

  it('is exactly these fields', () => {
    // A new entry here is a field this floor now has to cover. Give it the floor, then list it.
    // Listing it alone defeats the test.
    expect(fields.map(label).sort()).toEqual(INVENTORY)
  })

  it('has each one on the recipe or carrying the floor itself', () => {
    const under = fields.filter(
      ({ className }) => !ZOOM_FLOOR.test(className) && !ON_THE_RECIPE.test(className),
    )

    // Put the field on `fieldChrome` (`atoms/Select`), or give it `text-[16px] md:text-sm`.
    // Adding a `type` to `NON_TEXT_TYPES` instead is only right for a control nobody types into.
    expect(under.map(label)).toEqual([])
  })
})

// Comment-stripped, because both files below discuss the very classes being matched and
// documenting a rule must not satisfy it (`source-tree.ts`).
describe('the two places the floor is reached from outside a field', () => {
  it('has fieldChrome at 16px below md, and the 13px scale above it', () => {
    const recipe = readSourceWithoutComments('components/atoms/Select/Select.tsx')

    expect(recipe).toMatch(ZOOM_FLOOR)
    // Without this every field grows by 3px on a desktop too, which is a design question.
    expect(recipe).toContain('md:text-sm')
  })

  it("overrides the geocoder's own input, which our classes cannot otherwise reach", () => {
    // `@mapbox/search-js-web` gives its input `font: inherit` from a container it sizes from
    // `themes.ts`'s `unit` — the control's whole spacing scale, so raising that would resize the
    // suggestion list and truncate the placeholder. Hence a font-size-only override, on the
    // wrapper. `!` is not for specificity: measured in Chromium, a `.wrapper input` rule (0,1,1)
    // already beats the library's single-class `font: inherit`. It is because that rule is
    // emitted at RUNTIME under a hashed class, so nothing here can read what it will be.
    expect(readSourceWithoutComments('components/organisms/Mapbox/MapSearch.tsx')).toContain(
      'max-md:[&_input]:!text-[16px]',
    )
  })
})

describe('the standalone viewport meta', () => {
  // Comments stripped, so the tag's own comment is free to name the values it refuses.
  const shell = readRepoSource('index.html').replace(/<!--[\s\S]*?-->/g, '')

  it('pins neither the scale nor scalability', () => {
    expect(shell).not.toMatch(/user-scalable/)
    expect(shell).not.toMatch(/maximum-scale/)
    expect(shell).toContain('width=device-width')
  })

  it('is one tag, since a second one wins silently', () => {
    expect(shell.match(/<meta[^>]*name="viewport"/g) ?? []).toHaveLength(1)
  })
})
