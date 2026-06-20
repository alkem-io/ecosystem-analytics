import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import nl from './nl.json';
import en from './en.json';

export const SUPPORTED_LANGUAGES = ['nl', 'en'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

const STORAGE_KEY = 'vng_lang';

function initialLanguage(): Language {
  const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
  return stored === 'en' || stored === 'nl' ? stored : 'nl'; // Dutch default (FR-036)
}

void i18n.use(initReactI18next).init({
  resources: {
    nl: { translation: nl },
    en: { translation: en },
  },
  lng: initialLanguage(),
  fallbackLng: 'nl', // missing keys fall back to Dutch (edge case)
  interpolation: { escapeValue: false },
});

export function setLanguage(lang: Language): void {
  void i18n.changeLanguage(lang);
  if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, lang);
}

export default i18n;
