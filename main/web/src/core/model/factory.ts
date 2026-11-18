// SPDX-License-Identifier: GPL-3.0-or-later
import { newId } from './ids';
import { DEFAULT_KEYWORDS } from './keywords';
import type { Diagram, DiagramType, Element, ElementKind, Keywords } from './types';

function kw(word: string, fallback: string): string {
  return word.trim() === '' ? fallback : word.trim();
}

/** Default text for a newly inserted element (uses the diagram keywords). */
export function defaultText(kind: ElementKind, k: Keywords = DEFAULT_KEYWORDS): string[] {
  switch (kind) {
    case 'instruction': return [''];
    case 'call': return ['proc()'];
    case 'jump': return [k.preLeave];
    case 'alternative': return [joinKw(k.preAlt, '(?)', k.postAlt)];
    case 'case': return [joinKw(k.preCase, '(?)', k.postCase), '1', '2', 'default'];
    case 'for': return [`${kw(k.preFor, 'for')} i <- 1 ${kw(k.postFor, 'to')} 10`];
    case 'while': return [joinKw(k.preWhile, '(?)', k.postWhile)];
    case 'repeat': return [joinKw(k.preRepeat, '(?)', k.postRepeat)];
    case 'forever': return [];
    case 'parallel': return ['2'];
    case 'try': return ['ex'];
  }
}

function joinKw(pre: string, middle: string, post: string): string {
  return [pre, middle, post].map((s) => s.trim()).filter((s) => s !== '').join(' ');
}

export function createElement(kind: ElementKind, text?: string[], k?: Keywords): Element {
  const base = {
    id: newId(),
    text: text ?? defaultText(kind, k),
    comment: [] as string[],
    color: 'ffffff',
    disabled: false,
  };
  switch (kind) {
    case 'instruction': return { ...base, kind };
    case 'call': return { ...base, kind };
    case 'jump': return { ...base, kind };
    case 'alternative': return { ...base, kind, thenBranch: [], elseBranch: [] };
    case 'case': {
      const lines = base.text.length >= 3 ? base.text : [...base.text, '?', '?', '?'].slice(0, 3);
      return { ...base, kind, text: lines, branches: lines.slice(1).map(() => []) };
    }
    case 'for': return { ...base, kind, style: 'FREETEXT', body: [] };
    case 'while': return { ...base, kind, body: [] };
    case 'repeat': return { ...base, kind, body: [] };
    case 'forever': return { ...base, kind, text: [], body: [] };
    case 'parallel': {
      const n = Math.max(1, parseInt(base.text[0] ?? '2', 10) || 2);
      return { ...base, kind, text: [String(n)], branches: Array.from({ length: n }, () => []) };
    }
    case 'try': return { ...base, kind, tryBody: [], catchBody: [], finallyBody: [] };
  }
}

export function createDiagram(type: DiagramType = 'program'): Diagram {
  return {
    id: newId(),
    diagramType: type,
    boxed: true,
    text: [type === 'sub' ? 'sub()' : '???'],
    comment: [],
    color: 'ffffff',
    includeList: [],
    keywords: { ...DEFAULT_KEYWORDS },
    meta: { created: new Date().toISOString().slice(0, 10) },
    children: [],
  };
}
