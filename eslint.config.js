import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // `'dist'` alone matches only the top-level directory: flat-config ignore
  // patterns are relative to this file, so a nested `dist/` is not covered.
  // `.claude/` holds git worktrees — full checkouts of this repo — so without
  // it ESLint lints duplicate copies of src/ and their minified build output.
  // ESLint v9 does not read .gitignore, so being gitignored is not enough.
  globalIgnores(['**/dist', '.claude']),
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
])
