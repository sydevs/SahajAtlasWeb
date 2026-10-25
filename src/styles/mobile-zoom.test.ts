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
 * The 13px scale may only come back on a wide screen AND a fine pointer.
 *
 * A bare `md:` was the first attempt and it leaves the defect live: focus zoom is the engine's
 * behaviour, not the viewport's, and every iPhone since the 13 mini is at least 780px wide in
 * landscape — so `md:text-sm` would win there and the page would zoom exactly as before.
 */
const BARE_BREAKPOINT = /\bmd:text-sm\b/

/** Atoms whose own `className` prop reaches `fieldChrome`. */
const FIELD_COMPONENTS = ['Input', 'Textarea', 'Select', 'Combobox']

/**
 * A caller's `text-*` silently removes the floor and keeps the conditional half.
 *
 * Measured against this repo's `tailwind-variants` and `tailwind-merge`:
 * `fieldChrome({ className: 'text-xs' })` drops `text-[16px]` — same merge group — and keeps
 * `md:pointer-fine:text-sm`, which is a different one. The field then computes 12px on a phone
 * and 13px on a desktop, the worst of both.
 */
const CALLER_TEXT_SIZE = /\btext-(?:xs|sm|base|md|lg|xl|2xl|\[)/

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
const fieldsIn = (path: string, tags: string[]): Field[] => {
  const parsed = parseSource(path)
  const found: Field[] = []

  const visit = (node: ts.Node): void => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(parsed)

      if (tags.includes(tag)) {
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
  const fields = sources.flatMap((path) => fieldsIn(path, FIELD_TAGS))

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

    // Put the field on `fieldChrome` (`atoms/Select`), or give it
    // `text-[16px] md:pointer-fine:text-sm`. Adding a `type` to `NON_TEXT_TYPES` instead is only
    // right for a control nobody types into.
    expect(under.map(label)).toEqual([])
  })

  it('never takes the 13px scale back on width alone', () => {
    const bare = fields.filter(({ className }) => BARE_BREAKPOINT.test(className))

    expect(bare.map(label)).toEqual([])
  })

  it('has no caller handing a field atom its own text size', () => {
    const callers = sources
      .flatMap((path) => fieldsIn(path, FIELD_COMPONENTS))
      .filter(({ className }) => CALLER_TEXT_SIZE.test(className))

    // Such a `className` reaches `fieldChrome` and tailwind-merge resolves it against the floor,
    // not against the conditional half — so the field ends up smaller at every width. Change the
    // recipe instead, or wrap the field.
    expect(callers.map(label)).toEqual([])
  })
})

// Comment-stripped, because both files below discuss the very classes being matched and
// documenting a rule must not satisfy it (`source-tree.ts`).
describe('the two places the floor is reached from outside a field', () => {
  it('has fieldChrome at 16px, and the 13px scale only when wide and mouse-driven', () => {
    const recipe = readSourceWithoutComments('components/atoms/Select/Select.tsx')

    expect(recipe).toMatch(ZOOM_FLOOR)
    // Without this every field grows by 3px on a desktop too, which is a design question.
    expect(recipe).toContain('md:pointer-fine:text-sm')
  })

  it("overrides the geocoder's own input, which our classes cannot otherwise reach", () => {
    // `@mapbox/search-js-web` gives its input `font: inherit` from a container it sizes from
    // `themes.ts`'s `unit`, which also drives the suggestion list and its `padding: 1em` — hence
    // a font-size-only override, on the wrapper, rather than a bigger `unit`. Two arms because
    // CSS has no `or`. No `!`: measured in Chromium, `.wrapper input` (0,1,1) already beats the
    // library's single-class rule, whatever hash its class carries.
    const search = readSourceWithoutComments('components/organisms/Mapbox/MapSearch.tsx')

    expect(search).toContain('max-md:[&_input]:text-[16px]')
    expect(search).toContain('pointer-coarse:[&_input]:text-[16px]')
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
