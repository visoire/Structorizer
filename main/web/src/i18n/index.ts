import { de } from './de';
import { en, type Dict } from './en';

export type Lang = 'de' | 'en';
export type TKey = keyof Dict;

const dicts: Record<Lang, Dict> = { de, en };

export function detectLang(): Lang {
  try {
    const saved = localStorage.getItem('structorizer-web:lang');
    if (saved === 'de' || saved === 'en') return saved;
  } catch { /* storage blocked */ }
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('de') ? 'de' : 'en';
}

export function translator(lang: Lang) {
  const d = dicts[lang];
  return (key: TKey) => d[key] ?? en[key] ?? key;
}
