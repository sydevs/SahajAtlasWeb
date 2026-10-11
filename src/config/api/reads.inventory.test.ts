import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import ts from 'typescript'
import { describe, expect, it } from 'vitest'

// The rule this enforces is in `docs/rules/data-layer.md` ("SahajCloud query rules"): a client read
// sends an explicit `limit` and `page` and walks the rest with `readAllPages`. #253 converted the
// three wholesale reads and pinned what each one sends in `fetch.test.ts`. Those assertions say
// nothing about the next read somebody adds, and the failure mode is the quietest one in the rule:
// an ABSENT `limit` is not a refusal — Payload defaults it to 10, so the read returns ten rows
// while lint, typecheck and the unit lane all stay green.
//
// Precedent for the shape: `lib/shape/href.test.ts`'s "JSX anchor inventory" and
// `components/atoms/Icons/Icons.usage.test.tsx`.
//
// It is parsed, not grepped, for the reason `href.test.ts:156` records: a regex over raw text has
// to strip comments first, and every cheap way of doing that has a false pass in it. Commenting
// out a `limit` is exactly the edit this has to catch.
//
// Known blind spots, since a guard that oversells itself is worse than none. A read is seen only
// where the SDK or `requestJson` is reached through a static default or named import of
// `config/api/client`: a namespace import would hide one, so the last spec below fails on one
// rather than leaving this note to carry it, but a re-export under another name or a dynamic
// import is still invisible. `limit` resolves through one import hop to a module-level numeric
// literal, so a computed one reads as unresolvable, which fails rather than passes. Nothing here
// checks `select` or `populate`; those are their own clause of the same rule.

const srcDir = fileURLToPath(new URL('../../', import.meta.url))

const CLIENT_MODULE = 'config/api/client'
const PAGINATE_MODULE = 'config/api/paginate'

/**
 * SahajCloud's `MAX_CLIENT_LIMIT` (sydevs/SahajCloud#890). Over it is a 400, not a truncation.
 *
 * Its sibling `MAX_CLIENT_PAGE` of 10000 has no check here: a `page` must vary per call to pass at
 * all, and `MAX_PAGE_WALK` bounds the walk two orders of magnitude below that ceiling, so no
 * assertion on it could ever fail. `paginate.ts` dropped the same constant for the same reason.
 */
const MAX_CLIENT_LIMIT = 2000

/**
 * The custom endpoints `requestJson` reads, split by whether the response is a collection list.
 *
 * The AST cannot tell one from the other — both are a path string — so they are held here the way
 * `href.test.ts` holds `GATED_ANCHORS`, and an unlisted GET fails rather than being guessed at.
 */
const PAGINATED_READS = ['/events/geojson']
const SINGLE_RECORD_READS = ['/clients/me']

/**
 * `client.ts` constructs the SDK and owns the one generic `sdk.request` wrapper, whose argument is
 * its caller's options object — there is nothing at that site to inspect. The count below is what
 * keeps a second read from hiding here.
 */
const CLIENT_WRAPPER_REQUESTS = 1

const sources = readdirSync(srcDir, { recursive: true, withFileTypes: true })
  .filter(
    (entry) =>
      entry.isFile() &&
      /\.tsx?$/.test(entry.name) &&
      !entry.name.endsWith('.d.ts') &&
      !entry.name.includes('.test.') &&
      !entry.name.includes('.stories.'),
  )
  .map((entry) => relative(srcDir, join(entry.parentPath, entry.name)).split(sep).join('/'))
  // Generated SahajCloud types: thousands of lines of declarations, no call sites, and the slowest
  // thing under `src/` to parse. Scanning the other 255 files costs ~0.7s (measured 2026-10-11).
  .filter((path) => !path.startsWith('types/payload/'))

const parse = (path: string): ts.SourceFile =>
  ts.createSourceFile(
    path,
    readFileSync(join(srcDir, path), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )

const parsed = new Map(sources.map((path) => [path, parse(path)]))

/** `'./client'` from `config/api/fetch.ts`, or `'@/config/api/client'` from anywhere, both resolve here. */
const resolveSpecifier = (fromPath: string, specifier: string): string => {
  if (specifier.startsWith('@/')) return specifier.slice(2)
  if (!specifier.startsWith('.')) return specifier

  return join(dirname(fromPath), specifier).split(sep).join('/')
}

type Bindings = {
  /** The shared `PayloadSDK` instance's local name — a default import, or its own declaration in `client.ts`. */
  sdk?: string
  requestJson?: string
  readAllPages?: string
  walkSort?: string
  /** A namespace import of the client module, which would reach the SDK under a name this cannot follow. */
  namespaced?: boolean
}

const bindingsOf = (source: ts.SourceFile, path: string): Bindings => {
  const bindings: Bindings = {}

  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
      continue
    }

    const module = resolveSpecifier(path, statement.moduleSpecifier.text)
    const clause = statement.importClause

    if (!clause) continue

    if (module === CLIENT_MODULE && clause.name) bindings.sdk = clause.name.text

    if (
      module === CLIENT_MODULE &&
      clause.namedBindings &&
      ts.isNamespaceImport(clause.namedBindings)
    ) {
      bindings.namespaced = true
    }

    if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const element of clause.namedBindings.elements) {
        const imported = (element.propertyName ?? element.name).text

        // `import { default as sdk }` reaches the same instance as a default import.
        if (module === CLIENT_MODULE && imported === 'default') bindings.sdk = element.name.text

        if (module === CLIENT_MODULE && imported === 'requestJson') {
          bindings.requestJson = element.name.text
        }

        if (module === PAGINATE_MODULE && imported === 'readAllPages') {
          bindings.readAllPages = element.name.text
        }

        if (module === PAGINATE_MODULE && imported === 'walkSort') {
          bindings.walkSort = element.name.text
        }
      }
    }
  }

  // `client.ts` imports nothing from itself. Bind the instance it builds, so a read added there is
  // seen rather than silently exempt.
  if (path === `${CLIENT_MODULE}.ts`) {
    for (const statement of source.statements) {
      if (!ts.isVariableStatement(statement)) continue

      for (const declaration of statement.declarationList.declarations) {
        const { initializer, name } = declaration

        if (
          ts.isIdentifier(name) &&
          initializer &&
          ts.isNewExpression(initializer) &&
          initializer.expression.getText(source) === 'PayloadSDK'
        ) {
          bindings.sdk = name.text
        }
      }
    }
  }

  return bindings
}

/**
 * Module-level numeric constants, per file.
 *
 * Keyed by file rather than by name: `src/loader/literals.ts` duplicates values across the loader
 * seam on purpose, so two modules legitimately hold one name at two numbers.
 */
const constantsByFile = new Map<string, Map<string, number>>(
  [...parsed].map(([path, source]) => {
    const values = new Map<string, number>()

    for (const statement of source.statements) {
      if (!ts.isVariableStatement(statement)) continue

      for (const declaration of statement.declarationList.declarations) {
        const { initializer, name } = declaration

        if (ts.isIdentifier(name) && initializer && ts.isNumericLiteral(initializer)) {
          values.set(name.text, Number(initializer.text))
        }
      }
    }

    return [path, values]
  }),
)

/** Where a name in one file was imported from: `{ module, imported }`, by local name. */
const importsByFile = new Map<string, Map<string, { module: string; imported: string }>>(
  [...parsed].map(([path, source]) => {
    const bound = new Map<string, { module: string; imported: string }>()

    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
        continue
      }

      const module = resolveSpecifier(path, statement.moduleSpecifier.text)
      const named = statement.importClause?.namedBindings

      if (named && ts.isNamedImports(named)) {
        for (const element of named.elements) {
          bound.set(element.name.text, {
            module,
            imported: (element.propertyName ?? element.name).text,
          })
        }
      }
    }

    return [path, bound]
  }),
)

/** A module path as it appears in `parsed` (the keys carry an extension, an import specifier does not). */
const fileOf = (module: string): string | undefined =>
  [`${module}.ts`, `${module}.tsx`, `${module}/index.ts`].find((path) => parsed.has(path))

/** Resolves an identifier to a number through its own module, then through the module it came from. */
const constantIn = (path: string, name: string): number | undefined => {
  const local = constantsByFile.get(path)?.get(name)

  if (local !== undefined) return local

  const binding = importsByFile.get(path)?.get(name)
  const sourceFile = binding && fileOf(binding.module)

  return sourceFile ? constantsByFile.get(sourceFile)?.get(binding.imported) : undefined
}

const at = (source: ts.SourceFile, node: ts.Node, label: string): string => {
  const { line } = source.getLineAndCharacterOfPosition(node.getStart(source))

  return `${source.fileName}:${line + 1} ${label}`
}

const optionsOf = (call: ts.CallExpression): ts.ObjectLiteralExpression | undefined => {
  const [first] = call.arguments

  return first && ts.isObjectLiteralExpression(first) ? first : undefined
}

const propertyOf = (
  options: ts.ObjectLiteralExpression | undefined,
  key: string,
): ts.ObjectLiteralElementLike | undefined =>
  options?.properties.find((property) => property.name?.getText() === key)

const asObject = (expression: ts.Expression | undefined): ts.ObjectLiteralExpression | undefined =>
  expression && ts.isObjectLiteralExpression(expression) ? expression : undefined

const valueOf = (property: ts.ObjectLiteralElementLike | undefined): ts.Expression | undefined =>
  property && ts.isPropertyAssignment(property) ? property.initializer : undefined

/** A numeric literal, or an identifier that resolves to one. `undefined` means "could not tell". */
const asNumber = (expression: ts.Expression | undefined, path: string): number | undefined => {
  if (!expression) return undefined
  if (ts.isNumericLiteral(expression)) return Number(expression.text)
  if (ts.isIdentifier(expression)) return constantIn(path, expression.text)

  return undefined
}

const stringOf = (expression: ts.Expression | undefined): string | undefined =>
  expression && ts.isStringLiteral(expression) ? expression.text : undefined

/** Whether the call sits inside a callback passed to `readAllPages`. */
const insideWalk = (call: ts.Node, walkName: string | undefined): boolean => {
  if (!walkName) return false

  for (let node: ts.Node | undefined = call.parent; node; node = node.parent) {
    if (ts.isCallExpression(node) && node.expression.getText() === walkName) return true
  }

  return false
}

type Read = {
  site: string
  file: string
  /** `find` is a typed collection read. `request` is a custom endpoint, which only its path classifies. */
  kind: 'find' | 'request'
  /** Both are `undefined` where the call passes something other than a string literal. */
  path?: string
  method?: string
  options?: ts.ObjectLiteralExpression
  inWalk: boolean
  walkSortName?: string
}

const collectReads = (): { reads: Read[]; wrapperSites: string[]; namespaced: string[] } => {
  const reads: Read[] = []
  const wrapperSites: string[] = []
  const namespaced: string[] = []

  for (const [path, source] of parsed) {
    const bindings = bindingsOf(source, path)

    if (bindings.namespaced) namespaced.push(path)
    if (!bindings.sdk && !bindings.requestJson) continue

    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const callee = node.expression
        const isSdkMethod = (method: string): boolean =>
          ts.isPropertyAccessExpression(callee) &&
          callee.name.text === method &&
          ts.isIdentifier(callee.expression) &&
          callee.expression.text === bindings.sdk

        // `findByID` and `findGlobal` read one document and one global. Neither takes a `limit`,
        // so both are out of this inventory by construction, as are `mutate.ts`'s POSTs.
        if (isSdkMethod('find')) {
          reads.push({
            site: at(source, node, `${bindings.sdk}.find`),
            file: path,
            kind: 'find',
            options: optionsOf(node),
            inWalk: insideWalk(node, bindings.readAllPages),
            walkSortName: bindings.walkSort,
          })
        }

        const isRequestJson = ts.isIdentifier(callee) && bindings.requestJson === callee.text

        if (isRequestJson || isSdkMethod('request')) {
          const options = optionsOf(node)

          if (!options) {
            // `client.ts`'s own wrapper forwards its caller's options object.
            wrapperSites.push(at(source, node, 'a forwarded options object'))
          } else {
            reads.push({
              site: at(source, node, isRequestJson ? `${bindings.requestJson}()` : 'sdk.request'),
              file: path,
              kind: 'request',
              method: stringOf(valueOf(propertyOf(options, 'method'))),
              path: stringOf(valueOf(propertyOf(options, 'path'))),
              options,
              inWalk: insideWalk(node, bindings.readAllPages),
              walkSortName: bindings.walkSort,
            })
          }
        }
      }

      ts.forEachChild(node, visit)
    }

    ts.forEachChild(source, visit)
  }

  return { reads, wrapperSites, namespaced }
}

const { reads, wrapperSites, namespaced } = collectReads()

const finds = reads.filter((read) => read.kind === 'find')
const gets = reads.filter((read) => read.kind === 'request' && read.method === 'GET')

// A custom endpoint whose `method` is not a literal cannot be told from a mutation, so it would
// leave this inventory by being unreadable rather than by being exempt.
const unreadableMethods = reads.filter((read) => read.kind === 'request' && !read.method)

/**
 * Every claim the rule makes about one list read, as a list of violations.
 *
 * `limit` and `page` are the ticket's criteria. The `readAllPages` and `walkSort` checks are the
 * stronger claim the rule actually makes, and both are visible from this one call expression:
 * a read sending `limit: 2000, page: 1` and never walking truncates silently above 2000 rows, and
 * a walk sorted by a non-unique key repeats and drops rows at every page boundary.
 */
const violationsOf = (read: Read): string[] => {
  const problems: string[] = []
  const { file, site } = read
  // `sdk.find` takes the query at the top level. `requestJson` carries it under `args`, beside the
  // `method` and `path` that say which endpoint it is.
  const query =
    read.kind === 'find' ? read.options : asObject(valueOf(propertyOf(read.options, 'args')))

  if (!query) {
    return [`${site}: the query is not an object literal here, so this spec cannot read it.`]
  }

  const limit = propertyOf(query, 'limit')
  const page = propertyOf(query, 'page')
  const pagination = propertyOf(query, 'pagination')
  const sort = propertyOf(query, 'sort')

  if (!limit) {
    problems.push(
      `${site}: sends no \`limit\`. An absent limit is not an unbounded read — Payload defaults it to 10, so this returns ten rows with every gate green.`,
    )
  } else {
    const value = asNumber(valueOf(limit), file)

    if (value === undefined) {
      problems.push(
        `${site}: \`limit\` is not a number this spec can resolve. Send \`CLIENT_PAGE_LIMIT\`, or a numeric literal.`,
      )
    } else if (value < 1 || value > MAX_CLIENT_LIMIT) {
      problems.push(
        `${site}: \`limit\` is ${value}. SahajCloud allows 1…${MAX_CLIENT_LIMIT}; 0 is Payload's unbounded sentinel and a client gets no unbounded read.`,
      )
    }
  }

  if (!page) {
    problems.push(`${site}: sends no \`page\`. Pass the page \`readAllPages\` hands its callback.`)
  } else {
    // A fixed `page` is the defect a present-and-in-range check waves through: the walk then asks
    // for the same page `totalPages` times and concatenates it, so the read duplicates rows rather
    // than paginating. Only a value that varies per call can be the page the walk is on.
    const value = asNumber(valueOf(page), file)

    if (value !== undefined) {
      problems.push(
        `${site}: \`page\` is the fixed value ${value}. Pass the page \`readAllPages\` hands its callback, or this read repeats one page.`,
      )
    }
  }

  if (pagination) {
    problems.push(
      `${site}: sends \`pagination\`. A client gets no unbounded read (SahajCloud#887, #889) — walk the pages instead.`,
    )
  }

  if (!read.inWalk) {
    problems.push(
      `${site}: is not inside a \`readAllPages\` callback, so it reads one page and calls it the whole set.`,
    )
  }

  const sortValue = valueOf(sort)

  if (
    !sortValue ||
    !ts.isCallExpression(sortValue) ||
    sortValue.expression.getText() !== read.walkSortName
  ) {
    problems.push(
      `${site}: does not sort through \`walkSort\`. A LIMIT/OFFSET walk needs a total order, and only \`id\` makes any key list total.`,
    )
  }

  return problems
}

const RULE = 'docs/rules/data-layer.md, "SahajCloud query rules (enforced — 400 on violation)"'

describe('the SahajCloud collection-read inventory', () => {
  it('finds source files and the reads inside them (the walk itself must not silently break)', () => {
    expect(sources.length).toBeGreaterThan(100)
    expect(constantIn('config/api/fetch.ts', 'CLIENT_PAGE_LIMIT')).toBe(MAX_CLIENT_LIMIT)
    expect(finds.length).toBeGreaterThanOrEqual(2)
    expect(gets.length).toBeGreaterThanOrEqual(2)
  })

  it('has every `sdk.find` call site reading in bounded, totally ordered pages', () => {
    const problems = finds.flatMap(violationsOf)

    expect(
      problems,
      `A collection read does not follow ${RULE}. Each line below names the file, the line and what to change:\n\n${problems.join('\n')}\n`,
    ).toEqual([])
  })

  it('has every custom GET endpoint classified, and every list read among them paginated', () => {
    const unlisted = [
      ...gets
        .filter(
          (read) => !read.path || ![...PAGINATED_READS, ...SINGLE_RECORD_READS].includes(read.path),
        )
        .map(
          (read) =>
            `${read.site}: GET ${read.path ?? '(a path this spec cannot read)'} is in neither inventory. Decide which it is, then list it: PAGINATED_READS if it returns a collection list (and send \`limit\`, \`page\` and \`walkSort\` through \`readAllPages\`), SINGLE_RECORD_READS if it returns one record.`,
        ),
      ...unreadableMethods.map(
        (read) =>
          `${read.site}: \`method\` is not a string literal, so this spec cannot tell this read from a mutation. Write the method at the call site.`,
      ),
    ]

    expect(
      unlisted,
      `A custom SahajCloud GET is not in this spec's inventory. Only this file can say which kind it is.\n\n${unlisted.join('\n')}\n`,
    ).toEqual([])

    const problems = gets
      .filter((read) => read.path && PAGINATED_READS.includes(read.path))
      .flatMap(violationsOf)

    expect(
      problems,
      `A paginated custom endpoint does not follow ${RULE}.\n\n${problems.join('\n')}\n`,
    ).toEqual([])
  })

  it('keeps `requestJson`s own forwarding the only unreadable call site', () => {
    expect(
      wrapperSites,
      `A SahajCloud request forwards an options object this spec cannot read. Only \`requestJson\` in ${CLIENT_MODULE}.ts may. Give a new read a literal \`method\` and \`path\` at its own call site, where ${RULE} can be checked.\n\n${wrapperSites.join('\n')}\n`,
    ).toHaveLength(CLIENT_WRAPPER_REQUESTS)
  })

  it('has nothing reaching the SDK under a name this inventory cannot follow', () => {
    expect(
      namespaced,
      `These files import \`${CLIENT_MODULE}\` as a namespace, which hides every read in them from this inventory — the blind-spot note at the top of this file depends on there being none. Import \`sdk\` and \`requestJson\` by name instead.\n\n${namespaced.join('\n')}\n`,
    ).toEqual([])
  })
})
