import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import importPlugin from 'eslint-plugin-import'
import unusedImports from 'eslint-plugin-unused-imports'
import prettierConfig from 'eslint-config-prettier'
import prettier from 'eslint-plugin-prettier'
import tsParser from '@typescript-eslint/parser'
import tsPlugin from '@typescript-eslint/eslint-plugin'

// This is a flat config. It matches the other SY projects: WeMeditateWeb and
// sy-devs-cms. Prettier handles formatting through `.prettierrc`. The lint
// rules below match this project's existing conventions: import order,
// jsx-sort-props, padding lines, and automatic removal of unused imports.

// Vite rewrites this expression under the WEB transform, which vitest picks for every jsdom
// spec, so `fileURLToPath` throws AT IMPORT and the file dies before one assertion.
// `src/test-support/repo-source.ts` owns the root instead (#302).
//
// ⚠ **Shared by two blocks**, because flat config REPLACES a rule's options rather than merging
// them, so each block listing `no-restricted-syntax` has to carry every selector that applies
// in its scope.
const NO_URL_FROM_IMPORT_META = {
  selector:
    'NewExpression[callee.name="URL"][arguments.1.object.type="MetaProperty"][arguments.1.property.name="url"]',
  message:
    'Read a repo file with readRepoSource (src/test-support/repo-source.ts), or, in a .mjs that cannot import it, dirname(fileURLToPath(import.meta.url)) (#302).',
}

export default [
  {
    ignores: [
      'dist/**',
      'build/**', // Ladle's static build output (pnpm ladle:build)
      'node_modules/**',
      'public/**',
      'coverage/**',
      '.claude/**',
      'src/types/payload/**', // generated/synced from SahajCloud via `pnpm types:cms`
      '*.config.js',
      '*.config.ts',
    ],
  },
  {
    settings: {
      react: {
        version: 'detect',
      },
    },
  },
  react.configs.flat.recommended,
  jsxA11y.flatConfigs.recommended,
  prettierConfig,
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'module',
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      'react-hooks': reactHooks,
      import: importPlugin,
      'unused-imports': unusedImports,
      prettier,
    },
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'react/prop-types': 'off',
      'react/jsx-uses-react': 'off',
      'react/react-in-jsx-scope': 'off',
      'react/no-unescaped-entities': 'off',
      'react-hooks/rules-of-hooks': 'warn',
      'react-hooks/exhaustive-deps': 'off',
      'jsx-a11y/click-events-have-key-events': 'warn',
      'jsx-a11y/interactive-supports-focus': 'warn',
      'jsx-a11y/no-static-element-interactions': 'warn',
      'prettier/prettier': 'warn',
      'no-unused-vars': 'off',
      'unused-imports/no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          args: 'after-used',
          ignoreRestSiblings: false,
          argsIgnorePattern: '^_.*?$',
        },
      ],
      'import/order': [
        'warn',
        {
          groups: [
            'type',
            'builtin',
            'object',
            'external',
            'internal',
            'parent',
            'sibling',
            'index',
          ],
          pathGroups: [
            {
              pattern: '~/**',
              group: 'external',
              position: 'after',
            },
          ],
          'newlines-between': 'always',
        },
      ],
      'react/self-closing-comp': 'warn',
      'react/jsx-sort-props': [
        'warn',
        {
          callbacksLast: true,
          shorthandFirst: true,
          noSortAlphabetically: false,
          reservedFirst: true,
        },
      ],
      'padding-line-between-statements': [
        'warn',
        { blankLine: 'always', prev: '*', next: 'return' },
        { blankLine: 'always', prev: ['const', 'let', 'var'], next: '*' },
        {
          blankLine: 'any',
          prev: ['const', 'let', 'var'],
          next: ['const', 'let', 'var'],
        },
      ],
    },
  },
  {
    // One walk of `src/`, in `src/test-support/source-tree.ts` (#286). Nine specs grew their own
    // because prose was the only gate. `importNames` is what leaves the single-file readers
    // alone: a spec keeping `readFileSync`, `existsSync` or `statSync` is not a walk.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/test-support/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: ['node:fs', 'fs'].map((name) => ({
            name,
            importNames: ['readdirSync'],
            message: 'Walk src/ through src/test-support/source-tree.ts (#286).',
          })),
        },
      ],
    },
  },
  {
    // The non-spec half of the lane's module graph: `source-tree.ts` is what the defect actually
    // killed and it is no spec, and six `scripts/*.mjs` are in the graph one directory over,
    // five of them imported by a spec. Shipped code and the build configs are out —
    // `src/styles/fonts.ts` and `.ladle/` write the same form as the Vite asset-URL idiom, which
    // is what the form is for.
    //
    // Specs are the block below's alone, so the two scopes do not overlap. They cannot both
    // apply: see the shared constant above.
    files: ['src/test-support/**/*.ts', 'scripts/**/*.mjs'],
    ignores: ['**/*.{test,spec}.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': ['error', NO_URL_FROM_IMPORT_META],
    },
  },
  {
    // A spec may not derive a repo root at all, not even the safe way (#289): a hand-rolled one
    // duplicates `readRepoSource` and is what the next author copies. The block above cannot
    // carry this — `repo-source.ts` owns that root, and the `scripts/*.mjs` have no reader to
    // import.
    files: ['**/*.{test,spec}.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        NO_URL_FROM_IMPORT_META,
        {
          // Shape-specific, not a ban on `import.meta.url` itself: `src/lib/shadow-patches.test.ts`
          // resolves into `node_modules` with `createRequire(import.meta.url)`, which no
          // repo-relative reader can serve.
          selector:
            'CallExpression[callee.name="fileURLToPath"][arguments.0.object.type="MetaProperty"][arguments.0.property.name="url"]',
          message:
            'Read a repo file with readRepoSource (src/test-support/repo-source.ts) (#289).',
        },
      ],
    },
  },
]
