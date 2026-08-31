import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // `'dist'` alone matches only the top-level directory: flat-config ignore
  // patterns are relative to this file, so a nested `dist/` is not covered.
  // `.claude/worktrees/` holds full checkouts of this repo, so without it
  // ESLint lints duplicate copies of src/ and their minified build output.
  // ESLint v9 does not read .gitignore, so being gitignored is not enough.
  //
  // Scoped to `worktrees` rather than all of `.claude`: .gitignore un-ignores
  // `.claude/hooks/`, `skills/`, `agents/` and `settings.json`, so a tracked
  // hook script would be real, lintable project code. A blanket `.claude`
  // would skip it silently — which is the failure this whole config note is
  // about, one directory over.
  globalIgnores(['**/dist', '.claude/worktrees']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
  {
    // Spec 0010 R3/R4. shadcn/ui components export their `cva` variants beside
    // the component — `buttonVariants`, `badgeVariants`, `toggleVariants` — and
    // R4 requires restyling by extending those variants rather than stacking
    // classNames at call sites, so the export is the seam we are told to use.
    // react-refresh/only-export-components objects to a file exporting both.
    //
    // Scoped to the generated directory, not switched off globally: everywhere
    // else the rule still catches the real mistake it exists for. The cost is a
    // full reload instead of a hot update when a variant is edited, which is a
    // fair price for not diverging from upstream in seven files that
    // `shadcn add` will overwrite.
    files: ['src/components/ui/**/*.jsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
])
