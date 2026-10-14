import { createRoot } from 'react-dom/client'
import { resolveBootLocale, bootLocale } from './shared/i18n/localeStore.js'
import { loadMessages } from './shared/i18n/loadMessages.js'
import LanguagePicker from './shared/i18n/LanguagePicker.jsx'
import '@fontsource-variable/vazirmatn'
import './styles/tokens.css'
import './styles/language.css'

// The language is fixed before the rest of the app loads: its modules read it (texts, number formats) on import
const { locale, needsChoice } = resolveBootLocale()
bootLocale(locale)

;(async () => {
  if (needsChoice) {
    // First launch: ask before loading the app (the picker is written in both languages)
    createRoot(document.getElementById('root')).render(<LanguagePicker />)
    return
  }
  if (locale !== 'fa') await loadMessages(locale)
  const { renderApp } = await import('./bootApp.jsx')
  renderApp()
})()
