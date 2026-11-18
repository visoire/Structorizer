// SPDX-License-Identifier: GPL-3.0-or-later
// Web-optimised i18n registry: English is bundled eagerly as default and fallback;
// all 12 additional Structorizer Desktop languages load lazily as separate chunks.
import { useEffect, useSyncExternalStore } from 'react';
import { en, type Dict } from './en';

export type Lang =
  | 'en'
  | 'de'
  | 'fr'
  | 'nl'
  | 'lu'
  | 'es'
  | 'pt-br'
  | 'it'
  | 'zh-cn'
  | 'zh-tw'
  | 'cs'
  | 'ru'
  | 'pl';

export type TKey = keyof Dict;
export type T = (key: TKey) => string;

export interface LangMeta {
  id: Lang;
  name: string;
  htmlLang: string;
}

export const DEFAULT_LANG: Lang = 'en';

export const LANGS: readonly LangMeta[] = [
  { id: 'en', name: 'English', htmlLang: 'en' },
  { id: 'de', name: 'Deutsch', htmlLang: 'de' },
  { id: 'fr', name: 'Français', htmlLang: 'fr' },
  { id: 'nl', name: 'Nederlands', htmlLang: 'nl' },
  { id: 'lu', name: 'Lëtzebuergesch', htmlLang: 'lb' },
  { id: 'es', name: 'Español', htmlLang: 'es' },
  { id: 'pt-br', name: 'Português (Brasil)', htmlLang: 'pt-BR' },
  { id: 'it', name: 'Italiano', htmlLang: 'it' },
  { id: 'zh-cn', name: '简体中文', htmlLang: 'zh-CN' },
  { id: 'zh-tw', name: '繁體中文', htmlLang: 'zh-TW' },
  { id: 'cs', name: 'Čeština', htmlLang: 'cs' },
  { id: 'ru', name: 'Русский', htmlLang: 'ru' },
  { id: 'pl', name: 'Polski', htmlLang: 'pl' },
];

const LANG_SET = new Set<string>(LANGS.map((l) => l.id));

const LOADERS: Record<Exclude<Lang, 'en'>, () => Promise<Dict>> = {
  de: () => import('./locales/de').then((m) => m.de),
  fr: () => import('./locales/fr').then((m) => m.fr),
  nl: () => import('./locales/nl').then((m) => m.nl),
  lu: () => import('./locales/lu').then((m) => m.lu),
  es: () => import('./locales/es').then((m) => m.es),
  'pt-br': () => import('./locales/pt-br').then((m) => m.ptBr),
  it: () => import('./locales/it').then((m) => m.it),
  'zh-cn': () => import('./locales/zh-cn').then((m) => m.zhCn),
  'zh-tw': () => import('./locales/zh-tw').then((m) => m.zhTw),
  cs: () => import('./locales/cs').then((m) => m.cs),
  ru: () => import('./locales/ru').then((m) => m.ru),
  pl: () => import('./locales/pl').then((m) => m.pl),
};

const cache: Partial<Record<Lang, Dict>> = { en };
const pending = new Map<Lang, Promise<Dict>>();
let version = 0;
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const snapshot = () => version;

export function normalizeLang(raw: unknown): Lang {
  if (typeof raw !== 'string') return DEFAULT_LANG;
  const s = raw.trim().toLowerCase().replace(/_/g, '-');
  if (LANG_SET.has(s)) return s as Lang;
  if (s === 'cz' || s.startsWith('cs-') || s.startsWith('cz-')) return 'cs';
  if (s === 'lb' || s.startsWith('lb-') || s.startsWith('lu-')) return 'lu';
  if (s === 'pt' || s.startsWith('pt-')) return 'pt-br';
  if (s === 'zh-tw' || s === 'zh-hant' || s === 'zh-hk' || s === 'zh-mo') return 'zh-tw';
  if (s === 'zh' || s === 'zh-cn' || s === 'zh-hans' || s === 'zh-sg' || s.startsWith('zh-')) return 'zh-cn';
  const base = s.split('-')[0];
  if (LANG_SET.has(base)) return base as Lang;
  return DEFAULT_LANG;
}

export function htmlLang(lang: Lang): string {
  return LANGS.find((l) => l.id === lang)?.htmlLang ?? 'en';
}

export function detectLang(): Lang {
  return DEFAULT_LANG;
}

export function ensureLocale(lang: Lang): Promise<Dict> {
  const key = normalizeLang(lang);
  const cached = cache[key];
  if (cached) return Promise.resolve(cached);
  const existing = pending.get(key);
  if (existing) return existing;
  const load = LOADERS[key as Exclude<Lang, 'en'>];
  const p = load()
    .then((dict) => {
      cache[key] = dict;
      pending.delete(key);
      version++;
      listeners.forEach((fn) => fn());
      return dict;
    })
    .catch(() => {
      pending.delete(key);
      return en;
    });
  pending.set(key, p);
  return p;
}

export function translator(lang: Lang): T {
  const key = normalizeLang(lang);
  const d = cache[key] ?? en;
  return (k: TKey) => d[k] ?? en[k] ?? k;
}

export function useTranslator(lang: Lang): T {
  useSyncExternalStore(subscribe, snapshot, snapshot);
  useEffect(() => { void ensureLocale(lang); }, [lang]);
  return translator(lang);
}
