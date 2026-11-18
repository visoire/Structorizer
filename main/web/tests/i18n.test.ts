// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { DEFAULT_LANG, detectLang, ensureLocale, htmlLang, LANGS, normalizeLang, translator } from '../src/i18n';
import { en } from '../src/i18n/en';
import { DEFAULT_PREFS } from '../src/store/prefsStore';

describe('i18n', () => {
  it('uses English as the default and main language', () => {
    expect(DEFAULT_LANG).toBe('en');
    expect(DEFAULT_PREFS.lang).toBe('en');
    expect(LANGS[0].id).toBe('en');
    expect(LANGS).toHaveLength(13);
    expect(detectLang()).toBe('en');
  });

  it('normalizes language codes and HTML lang tags', () => {
    expect(normalizeLang('en-US')).toBe('en');
    expect(normalizeLang('de_DE')).toBe('de');
    expect(normalizeLang('cz')).toBe('cs');
    expect(normalizeLang('cs-CZ')).toBe('cs');
    expect(normalizeLang('lb')).toBe('lu');
    expect(normalizeLang('pt_br')).toBe('pt-br');
    expect(normalizeLang('pt')).toBe('pt-br');
    expect(normalizeLang('zh')).toBe('zh-cn');
    expect(normalizeLang('zh_cn')).toBe('zh-cn');
    expect(normalizeLang('zh-Hans')).toBe('zh-cn');
    expect(normalizeLang('zh-TW')).toBe('zh-tw');
    expect(normalizeLang('zh-Hant')).toBe('zh-tw');
    expect(normalizeLang('unknown')).toBe('en');
    expect(normalizeLang(null)).toBe('en');

    expect(htmlLang('en')).toBe('en');
    expect(htmlLang('lu')).toBe('lb');
    expect(htmlLang('pt-br')).toBe('pt-BR');
    expect(htmlLang('zh-cn')).toBe('zh-CN');
    expect(htmlLang('zh-tw')).toBe('zh-TW');
  });

  it('loads every supported desktop locale with complete, clean keys', async () => {
    const enKeys = Object.keys(en).sort();
    for (const meta of LANGS) {
      const dict = await ensureLocale(meta.id);
      expect(Object.keys(dict).sort()).toEqual(enKeys);
      for (const k of enKeys) {
        const val = dict[k as keyof typeof en];
        expect(typeof val).toBe('string');
        expect(val.trim().length, `${meta.id}.${k} empty`).toBeGreaterThan(0);
        expect(val, `${meta.id}.${k} Swing placeholder`).not.toMatch(/@([a-z]|\{)/);
        expect(val, `${meta.id}.${k} Swing mnemonic`).not.toMatch(/(?:^|\s)&[A-Za-z]/);
      }
      const t = translator(meta.id);
      expect(t('m.file')).toBe(dict['m.file']);
      expect(t('tagline')).toBe(dict.tagline);
    }
  });
});
