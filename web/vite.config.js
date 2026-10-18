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

/**
 * Identifies this build: the code gets it as __APP_BUILD__ and /version.json carries it, so a page
 * that is already open can tell a newer deploy from itself (shared/pwa/versionCheck.js).
 */
const BUILD_ID = (process.env.CF_PAGES_COMMIT_SHA || process.env.GITHUB_SHA || '').slice(0, 12) || Date.now().toString(36);

function versionFile() {
  return {
    name: 'version-file',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD_ID }) });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  define: { __APP_BUILD__: JSON.stringify(BUILD_ID) },
  plugins: [react(), versionFile(), ...(mode === 'app' ? [androidAppViewport()] : [])],
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
}))
