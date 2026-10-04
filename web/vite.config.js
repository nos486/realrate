import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * The Android app build (`vite build --mode app`, web/android): the page stays between the system
 * bars. With viewport-fit=cover (for the installed iPhone web app) Capacitor would lay it out under
 * the status bar instead.
 */
function androidAppViewport() {
  return {
    name: 'android-app-viewport',
    transformIndexHtml: (html) => html.replace(', viewport-fit=cover', ''),
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'app' ? [androidAppViewport()] : [])],
  server: {
    port: 5173,
    proxy: {
      // Proxy /api requests to live backend (or local worker if set)
      '/api': {
        target: process.env.VITE_PROXY_TARGET || 'https://api.realrate.ir',
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
}))
