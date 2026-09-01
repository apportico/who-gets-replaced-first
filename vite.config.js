import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// GitHub Pages serves a project site under /<repo>/, so the production build
// needs that prefix or every asset request 404s. Dev keeps the root path.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/who-gets-replaced-first/' : '/',
  plugins: [react(), tailwindcss()],
  // Spec 0010 R3. shadcn writes `@/` imports, and Vite does not read
  // jsconfig.json for resolution — the paths block there is for the editor.
  // Both have to exist or the build resolves nothing.
  // 0015 R2. A second entry, not a router. The methodology page is a real
  // page with a real URL so it can be linked, opened in a new tab and followed
  // by a crawler; 0010's Non-goals keep the wizard router-free and #79 owns
  // URL state, and a second build input touches neither.
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        methodology: fileURLToPath(new URL('./methodology.html', import.meta.url)),
      },
    },
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
}))
