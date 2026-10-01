import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import ts from 'typescript'
import { describe, expect, it } from 'vitest'

/**
 * Every scope root `Widget.tsx` renders opts out of page translation (#239).
 *
 * Google Translate, GTranslate and Weglot's JS mode rewrite a page's text nodes in place. Inside
 * the widget those nodes belong to React, so its next update to one throws (`removeChild`,
 * `insertBefore`) and the visitor lands on the error screen. The widget localises itself.
 *
 * Pinned in source, as `Widget.theme-root.test.tsx` pins its wiring: rendering the real element
 * would boot the router, i18n and the loader's config for one attribute. Read from the AST rather
 * than matched as text, so a reformat cannot hide a scope root from it.
 */
const FILE = join(dirname(fileURLToPath(import.meta.url)), 'Widget.tsx')

type ScopeRoot = { line: number; translate: string | undefined }

function scopeRoots(): ScopeRoot[] {
  const source = ts.createSourceFile(
    FILE,
    readFileSync(FILE, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  const roots: ScopeRoot[] = []

  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const attribute = (name: string) =>
        node.attributes.properties.find(
          (prop): prop is ts.JsxAttribute =>
            ts.isJsxAttribute(prop) && prop.name.getText(source) === name,
        )

      if (attribute('className')?.initializer?.getText(source).includes('WIDGET_SCOPE_CLASS')) {
        const translate = attribute('translate')?.initializer

        roots.push({
          line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
          translate: translate && ts.isStringLiteral(translate) ? translate.text : undefined,
        })
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(source)

  return roots
}

describe('the scope roots in Widget.tsx', () => {
  const roots = scopeRoots()

  // Without this, a walker that stopped finding them would pass the case below on nothing.
  it('are found: the boot surface and the theme wrapper', () => {
    expect(roots).toHaveLength(2)
  })

  it('all carry translate="no"', () => {
    expect(roots.filter((root) => root.translate !== 'no')).toEqual([])
  })
})
