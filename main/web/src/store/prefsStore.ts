// SPDX-License-Identifier: GPL-3.0-or-later
// User preferences, stored only in this browser (localStorage). Desktop: Preferences menu + View toggles.
import { create } from 'zustand';
import type { LangId } from '../core/gen/generators';
import { DEFAULT_KEYWORDS, type Keywords } from '../core/model';
import { DEFAULT_LANG, ensureLocale, normalizeLang, type Lang } from '../i18n';

export type Theme = 'system' | 'light' | 'dark';
export type PanelTab = 'code' | 'index';

export interface Prefs {
  lang: Lang;
  theme: Theme;
  /** Draw the diagram itself dark in dark mode (exports always stay light). */
  darkDiagram: boolean;
  // View menu (desktop names)
  showComments: boolean;
  highlightVars: boolean;
  cOperators: boolean;
  switchTextComments: boolean;
  commentsPlusText: boolean;
  // side panel (Arranger index / Code preview)
  panelOpen: boolean;
  panelTab: PanelTab;
  panelWidth: number;
  // code export
  codeLang: LangId;
  involveSubroutines: boolean;
  // structures / parser
  defaultKeywords: Keywords;
  simplifiedToolbar: boolean;
  confirmDelete: boolean;
  // fonts (local only) and export look
  uiFont: FontId;
  customUiFont: string;
  diagramFont: FontId;
  customDiagramFont: string;
  diagramFontSize: number;
  exportColors: boolean;
  exportTransparent: boolean;
}

type FontId = 'system' | 'arial' | 'verdana' | 'serif' | 'mono' | 'rounded' | 'custom';

const KEY = 'structorizer-web:prefs';

export const DEFAULT_PREFS: Prefs = {
  lang: 'en',
  theme: 'system',
  darkDiagram: true,
  showComments: true,
  highlightVars: true,
  cOperators: false,
  switchTextComments: false,
  commentsPlusText: false,
  panelOpen: true,
  panelTab: 'code',
  panelWidth: 380,
  codeLang: 'python',
  involveSubroutines: true,
  defaultKeywords: { ...DEFAULT_KEYWORDS },
  simplifiedToolbar: false,
  confirmDelete: false,
  uiFont: 'system',
  customUiFont: '',
  diagramFont: 'system',
  customDiagramFont: '',
  diagramFontSize: 14,
  exportColors: true,
  exportTransparent: false,
};

function load(): Prefs {
  const base = { ...DEFAULT_PREFS, lang: DEFAULT_LANG };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const p = JSON.parse(raw) as Partial<Prefs>;
    return {
      ...base,
      ...p,
      lang: p.lang !== undefined ? normalizeLang(p.lang) : DEFAULT_LANG,
      defaultKeywords: { ...DEFAULT_KEYWORDS, ...(p.defaultKeywords ?? {}) },
    };
  } catch {
    return base;
  }
}

interface PrefsState extends Prefs {
  set: (p: Partial<Prefs>) => void;
  toggle: (k: { [K in keyof Prefs]: Prefs[K] extends boolean ? K : never }[keyof Prefs]) => void;
  reset: () => void;
  /** Import preferences from a JSON file content (desktop: "Load from file"). */
  importJson: (json: string) => void;
  exportJson: () => string;
}

export const usePrefs = create<PrefsState>((set, get) => ({
  ...load(),
  set: (p) => {
    if (p.lang !== undefined) {
      const lang = normalizeLang(p.lang);
      void ensureLocale(lang);
      set({ ...p, lang });
      return;
    }
    set(p);
  },
  toggle: (k) => set({ [k]: !get()[k] } as Partial<Prefs>),
  reset: () => set({ ...DEFAULT_PREFS, lang: get().lang }),
  importJson: (json) => {
    const p = JSON.parse(json) as Partial<Prefs>;
    const clean: Partial<Prefs> = {};
    for (const k of Object.keys(DEFAULT_PREFS) as (keyof Prefs)[]) {
      if (k === 'lang' && 'lang' in p && p.lang !== undefined) {
        const lang = normalizeLang(p.lang);
        void ensureLocale(lang);
        clean.lang = lang;
      } else if (k in p && typeof p[k] === typeof DEFAULT_PREFS[k]) {
        (clean as Record<string, unknown>)[k] = p[k];
      }
    }
    set(clean);
  },
  exportJson: () => {
    const s = get();
    const out: Partial<Prefs> = {};
    for (const k of Object.keys(DEFAULT_PREFS) as (keyof Prefs)[]) (out as Record<string, unknown>)[k] = s[k];
    return JSON.stringify(out, null, 2);
  },
}));

// persist every change (try/catch: storage may be blocked)
usePrefs.subscribe((s) => {
  try {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(DEFAULT_PREFS)) out[k] = (s as unknown as Record<string, unknown>)[k];
    localStorage.setItem(KEY, JSON.stringify(out));
  } catch { /* ignore */ }
});

/** Effective theme for the system setting. */
export function resolvedTheme(t: Theme): 'light' | 'dark' {
  if (t !== 'system') return t;
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
