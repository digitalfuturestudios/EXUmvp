// ============================================================
// I18N CONFIGURATION — react-i18next with bundled JSON locales.
// Uses Vite's static import so Service Worker can cache them.
// No HTTP requests needed — fully offline capable.
// ============================================================

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Static imports — Vite bundles these at build time.
// The Service Worker caches the entire JS bundle (CacheFirst),
// making translations 100% available offline.
import enTranslations from '../shared/locales/en/translation.json';
import esTranslations from '../shared/locales/es/translation.json';

const LANGUAGE_STORAGE_KEY = 'exu_language';

/** Detects initial language from localStorage → browser → fallback */
function detectLanguage(): 'es' | 'en' {
  const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (stored === 'es' || stored === 'en') return stored;

  const browserLang = navigator.language.split('-')[0];
  return browserLang === 'es' ? 'es' : 'en';
}

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: enTranslations },
      es: { translation: esTranslations },
    },
    lng: detectLanguage(),
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false, // React already escapes by default
    },
    // No backend needed — resources are bundled
    initImmediate: true,
  });

/** Persists language preference to localStorage */
i18n.on('languageChanged', (lang: string) => {
  localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
});

export default i18n;
