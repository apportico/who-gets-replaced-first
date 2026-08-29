import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// GitHub Pages serves a project site under /<repo>/, so the production build
// needs that prefix or every asset request 404s. Dev keeps the root path.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/who-gets-replaced-first/' : '/',
  plugins: [react(), tailwindcss()],
}))
