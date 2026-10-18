import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ThemeProvider } from './context/ThemeContext.jsx'
import { AuthProvider } from './features/auth/index.js'
import { DemoProvider } from './features/demo/index.js'
import { FeedbackProvider } from './shared/ui/FeedbackProvider.jsx'
// Self-hosted: Google Fonts is slow or blocked for many users in Iran
import '@fontsource-variable/vazirmatn'
import './styles/index.css'
import App from './App.jsx'
import { registerServiceWorker } from './shared/pwa/registerServiceWorker.js'
import { startVersionChecks } from './shared/pwa/versionCheck.js'
import { initNativeApp } from './shared/native/nativeApp.js'
import { initAppLayoutClass } from './shared/app/appLayout.js'

/**
 * Renders the app. Loaded by main.jsx once the language is set, since module-level texts and
 * number formats read it on import.
 */
export function renderApp() {
  const root = createRoot(document.getElementById('root'))
  registerServiceWorker()
  startVersionChecks()
  // The app's frame and touch feel (styles/app-shell.css): the Android app and phone-sized screens
  initAppLayoutClass()
  initNativeApp()
  root.render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <FeedbackProvider>
          <AuthProvider>
            <DemoProvider>
              <App />
            </DemoProvider>
          </AuthProvider>
        </FeedbackProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
  )
}
