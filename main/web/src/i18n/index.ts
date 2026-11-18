import { de } from './de';
import { en, type Dict } from './en';

export type Lang = 'de' | 'en';
export type TKey = keyof Dict;
export type T = (key: TKey) => string;

const dicts: Record<Lang, Dict> = { de, en };

export function detectLang(): Lang {
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('de') ? 'de' : 'en';
}

export function translator(lang: Lang): T {
  const d = dicts[lang] ?? en;
  return (key: TKey) => d[key] ?? en[key] ?? key;
}
