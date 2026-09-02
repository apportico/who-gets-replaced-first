// Spec 0019 R3. Tailwind v4 through PostCSS, replacing the `@tailwindcss/vite`
// plugin. The fonts do NOT come through this file — see app/layout.tsx and
// 0010 R2 for why a CSS `@import` is the one thing that must not be used.
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}

export default config
