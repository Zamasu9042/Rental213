import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

/** Kong + Camunda proxy (see backend/kong.yml). Same-origin in dev avoids CORS on any Vite port. */
const kongTarget = 'http://127.0.0.1:8000'

export default defineConfig({
  base: './',
  plugins: [
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },

  server: {
    proxy: {
      '/api': { target: kongTarget, changeOrigin: true },
      '/webhook': { target: kongTarget, changeOrigin: true },
    },
  },
  preview: {
    proxy: {
      '/api': { target: kongTarget, changeOrigin: true },
      '/webhook': { target: kongTarget, changeOrigin: true },
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],
})
