// SPDX-License-Identifier: GPL-3.0-or-later
// Display form of element text: Unicode or C-style operators and syntax highlighting
// (desktop View menu: "Highlight variables?", "Show operators in C style?").
import { tokenize } from '../lang/lexer';
import type { Keywords } from '../model/types';

export type SpanClass = 'var' | 'op' | 'str' | 'io' | 'jump' | 'muted';
export interface Span { s: string; c?: SpanClass }

export interface DisplayOptions {
  cOperators?: boolean;
  highlight?: boolean;
  vars?: ReadonlySet<string>;
  keywords?: Keywords;
}

const WORD_OPS = new Set(['and', 'or', 'not', 'xor', 'div', 'mod', 'shl', 'shr']);
const C_WORD: Record<string, string> = { and: '&&', or: '||', not: '!', xor: '^', div: '/', mod: '%', shl: '<<', shr: '>>' };

function startsWithWord(line: string, word: string, ic: boolean): boolean {
  const w = word.trim();
  if (!w) return false;
  const head = line.trimStart().slice(0, w.length);
  return (ic ? head.toLowerCase() === w.toLowerCase() : head === w) && !/[\p{L}\p{N}_]/u.test(line.trimStart()[w.length] ?? ' ');
}

export function displaySpans(line: string, o: DisplayOptions = {}): Span[] {
  const out: Span[] = [];
  const k = o.keywords;
  // leading keyword of input/output/jump lines
  let rest = line;
  if (k && o.highlight) {
    const ic = k.ignoreCase;
    for (const [kw, c] of [[k.input, 'io'], [k.output, 'io'], [k.preReturn, 'jump'], [k.preLeave, 'jump'], [k.preExit, 'jump'], [k.preThrow, 'jump']] as const) {
      if (startsWithWord(rest, kw, ic)) {
        const lead = rest.length - rest.trimStart().length;
        out.push({ s: rest.slice(0, lead + kw.trim().length), c });
        rest = rest.slice(lead + kw.trim().length);
        break;
      }
    }
  }
  for (const t of tokenize(rest)) {
    let s = t.v;
    let c: SpanClass | undefined;
    if (t.k === 'op') {
      if (s === '<-' || s === ':=') s = o.cOperators ? '=' : '←';
      else if (s === '<=') s = o.cOperators ? '<=' : '≤';
      else if (s === '>=') s = o.cOperators ? '>=' : '≥';
      else if (s === '<>' || s === '!=') s = o.cOperators ? '!=' : '≠';
      else if (s === '=' && o.cOperators) s = '==';
      c = 'op';
    } else if (t.k === 'str') c = 'str';
    else if (t.k === 'id') {
      const low = s.toLowerCase();
      if (WORD_OPS.has(low)) { c = 'op'; if (o.cOperators) s = C_WORD[low]; }
      else if (o.vars?.has(s)) c = 'var';
    }
    out.push({ s, c: o.highlight ? c : undefined });
  }
  // merge neighbours of the same class (fewer tspans)
  const merged: Span[] = [];
  for (const sp of out) {
    const last = merged[merged.length - 1];
    if (last && last.c === sp.c) last.s += sp.s;
    else merged.push({ ...sp });
  }
  return merged;
}

export function displayText(line: string, o: DisplayOptions = {}): string {
  return displaySpans(line, o).map((s) => s.s).join('');
}
