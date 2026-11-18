// SPDX-License-Identifier: GPL-3.0-or-later
// Constants from docs/layout-spec.md section 1 and pluggable text measurement.

export const P = 20;
export const HALF = P / 2;
export const FONT_SIZE = 14;
export const LINE_H = Math.round(FONT_SIZE * 1.3);
export const ROOT_CORNER = 15;
export const FONT_FAMILY = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export type MeasureFn = (text: string, bold?: boolean) => number;

/** Deterministic measurer for tests. */
export const fakeMeasure: MeasureFn = (s, bold) => s.length * (bold ? 9 : 8);

/** Browser measurer based on an offscreen canvas, cached per string. */
export function createCanvasMeasure(): MeasureFn {
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  const ctx = canvas?.getContext('2d') ?? null;
  if (!ctx) return fakeMeasure;
  const cache = new Map<string, number>();
  return (s, bold) => {
    const key = (bold ? 'b' : 'n') + s;
    let w = cache.get(key);
    if (w === undefined) {
      ctx.font = `${bold ? 'bold ' : ''}${FONT_SIZE}px ${FONT_FAMILY}`;
      w = Math.ceil(ctx.measureText(s).width);
      if (cache.size > 5000) cache.clear();
      cache.set(key, w);
    }
    return w;
  };
}

/** Baseline offset of a text line whose box starts at `top`. */
export function baseline(top: number): number {
  return top + Math.round((LINE_H - FONT_SIZE) / 2 + FONT_SIZE * 0.82);
}

/**
 * Display form of an element text line: operators shown as Unicode symbols like the
 * desktop (E_SHOW_UNICODE_OPERATORS), never inside string literals.
 */
export function displayLine(line: string): string {
  let out = '';
  let quote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      out += c;
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") { quote = c; out += c; continue; }
    const two = line.slice(i, i + 2);
    if (two === '<-') { out += '←'; i++; continue; }
    if (two === ':=') { out += '←'; i++; continue; }
    if (two === '<=') { out += '≤'; i++; continue; }
    if (two === '>=') { out += '≥'; i++; continue; }
    if (two === '<>' || two === '!=') { out += '≠'; i++; continue; }
    out += c;
  }
  return out;
}
