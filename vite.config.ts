import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // The dashboard is opened on a desk, not on campus data, so the budget
    // here buys clarity rather than bytes. Charts are the one heavy dep and
    // they are split out so the login screen never downloads them.
    rollupOptions: {
      output: {
        // The function form rather than the object map: Rollup's types only
        // accept a function in this position, so the map spelling failed
        // typecheck and took `npm run build` down with it. Matching on the
        // module path also catches the transitive `@firebase/*` packages the
        // map form missed, which is what actually made the chunk worth having.
        manualChunks(id: string) {
          if (id.includes('node_modules/recharts')) return 'charts'
          if (id.includes('node_modules/firebase') || id.includes('node_modules/@firebase')) {
            return 'firebase'
          }
          return undefined
        },
      },
    },
  },
})
