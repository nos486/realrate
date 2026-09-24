import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Proxy /api requests to live backend (or local worker if set)
      '/api': {
        target: process.env.VITE_PROXY_TARGET || 'https://realrate-api.geekio.org',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rolldownOptions: {
      output: {
        // Route/tab chunks are split with React.lazy; keep the shared icons in one chunk
        // instead of a dozen sub-kilobyte files (one request each).
        advancedChunks: {
          groups: [{ name: 'icons', test: /node_modules[\\/]lucide-react/ }],
        },
      },
    },
  },
})
