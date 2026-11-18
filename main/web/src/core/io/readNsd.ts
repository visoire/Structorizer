// SPDX-License-Identifier: GPL-3.0-or-later
// Reader for Structorizer .nsd files (docs/nsd-format.md). Port of the rules in parsers/NSDParser.java.
import { newId } from '../model/ids';
import { DEFAULT_KEYWORDS, KEYWORD_KEYS } from '../model/keywords';
import type { Diagram, Element, ForStyle, Hex, Keywords } from '../model/types';
import { decodeLines } from './commaText';

export class NsdError extends Error {}

export interface ReadResult { diagram: Diagram; warnings: string[] }

const ELEMENT_TAGS = new Set([
  'instruction', 'call', 'jump', 'alternative', 'case', 'for', 'while', 'repeat', 'forever', 'parallel', 'try',
]);

function childElements(node: globalThis.Element, tag?: string): globalThis.Element[] {
  const out: globalThis.Element[] = [];
  for (let c = node.firstElementChild; c; c = c.nextElementSibling) {
    if (!tag || c.localName === tag) out.push(c);
  }
  return out;
}

function attr(node: globalThis.Element, name: string): string | null {
  return node.hasAttribute(name) ? node.getAttribute(name) : null;
}

function hex(value: string | null): Hex {
  if (!value) return 'ffffff';
  const v = value.trim().replace(/^#/, '').toLowerCase();
  return /^[0-9a-f]{6}$/.test(v) ? v : 'ffffff';
}

function hexList(value: string | null): (Hex | '')[] | undefined {
  if (!value || value.trim() === '') return undefined;
  const list = value.split(',').map((v) => {
    const t = v.trim().toLowerCase();
    return /^[0-9a-f]{6}$/.test(t) ? t : '';
  });
  return list.some((c) => c !== '') ? list : undefined;
}

export function readNsd(xml: string): ReadResult {
  const warnings: string[] = [];
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const err = doc.getElementsByTagName('parsererror')[0];
  if (err) throw new NsdError('Not a valid XML file: ' + (err.textContent ?? '').trim().slice(0, 200));
  const rootNode = doc.documentElement;
  if (!rootNode || rootNode.localName !== 'root') throw new NsdError('Not a Structorizer diagram (missing <root>).');

  const keywords: Keywords = { ...DEFAULT_KEYWORDS };
  for (const key of KEYWORD_KEYS) {
    const v = attr(rootNode, key);
    if (v !== null) keywords[key] = v;
  }
  if (attr(rootNode, 'preForIn') === null && attr(rootNode, 'preFor') !== null) keywords.preForIn = keywords.preFor;
  const ic = attr(rootNode, 'ignoreCase');
  if (ic !== null) keywords.ignoreCase = ic === 'true';

  const type = attr(rootNode, 'type');
  const fileVersion = attr(rootNode, 'version') ?? undefined;

  const common = (node: globalThis.Element) => ({
    id: newId(),
    text: decodeLines(attr(node, 'text') ?? ''),
    comment: decodeLines(attr(node, 'comment') ?? ''),
    color: hex(attr(node, 'color')),
    disabled: attr(node, 'disabled') === '1',
  });

  const readSeq = (container: globalThis.Element | undefined): Element[] => {
    if (!container) return [];
    const out: Element[] = [];
    for (const c of childElements(container)) {
      if (ELEMENT_TAGS.has(c.localName)) out.push(readElement(c));
      else warnings.push(`Unknown element <${c.localName}> ignored.`);
    }
    return out;
  };

  const first = (node: globalThis.Element, tag: string) => childElements(node, tag)[0];

  const readElement = (node: globalThis.Element): Element => {
    const base = common(node);
    switch (node.localName) {
      case 'instruction': return { ...base, kind: 'instruction' };
      case 'call': return { ...base, kind: 'call', isMethodDeclaration: attr(node, 'ismethoddecl') === '1' || undefined };
      case 'jump': return { ...base, kind: 'jump' };
      case 'alternative':
        return {
          ...base, kind: 'alternative',
          thenBranch: readSeq(first(node, 'qTrue')),
          elseBranch: readSeq(first(node, 'qFalse')),
          branchHeadColors: hexList(attr(node, 'branch_colors')),
        };
      case 'case': {
        const branches = childElements(node, 'qCase').map((q) => readSeq(q));
        const text = base.text.slice();
        while (branches.length < 2) branches.push([]);
        if (text.length - 1 !== branches.length) {
          warnings.push(`CASE "${text[0] ?? ''}": ${text.length - 1} selector lines but ${branches.length} branches; adjusted.`);
          while (text.length - 1 < branches.length) text.splice(Math.max(1, text.length - 1), 0, '?');
          while (text.length - 1 > branches.length) branches.push([]);
        }
        if (text.length === 0) text.push('???');
        const colors = hexList(attr(node, 'branch_colors'));
        return { ...base, kind: 'case', text, branches, branchHeadColors: colors?.slice(0, branches.length) };
      }
      case 'for': {
        let style: ForStyle = 'FREETEXT';
        const st = attr(node, 'style');
        if (attr(node, 'reliable') === 'true') style = 'COUNTER';
        else if (st === 'COUNTER' || st === 'TRAVERSAL' || st === 'FREETEXT') style = st;
        const step = attr(node, 'stepConst');
        const stepNum = step !== null ? parseInt(step, 10) : NaN;
        return {
          ...base, kind: 'for', style,
          counterVar: attr(node, 'counterVar') ?? undefined,
          startValue: attr(node, 'startValue') ?? attr(node, 'StartValue') ?? undefined,
          endValue: attr(node, 'endValue') ?? undefined,
          stepConst: Number.isFinite(stepNum) ? stepNum : undefined,
          body: readSeq(first(node, 'qFor')),
        };
      }
      case 'while': return { ...base, kind: 'while', body: readSeq(first(node, 'qWhile')) };
      case 'repeat': return { ...base, kind: 'repeat', body: readSeq(first(node, 'qRepeat')) };
      case 'forever': return { ...base, kind: 'forever', text: [], body: readSeq(first(node, 'qForever')) };
      case 'parallel': {
        const branches = childElements(node, 'qPara').map((q) => readSeq(q));
        if (branches.length === 0) branches.push([]);
        return { ...base, kind: 'parallel', text: [String(branches.length)], branches };
      }
      case 'try':
        return {
          ...base, kind: 'try',
          tryBody: readSeq(first(node, 'qTry')),
          catchBody: readSeq(first(node, 'qCatch')),
          finallyBody: readSeq(first(node, 'qFinally')),
        };
      default:
        throw new NsdError(`Unexpected tag ${node.localName}`);
    }
  };

  const includeRaw = attr(rootNode, 'includeList');
  const meta = {
    author: attr(rootNode, 'author') ?? undefined,
    created: attr(rootNode, 'created') ?? undefined,
    changedBy: attr(rootNode, 'changedby') ?? undefined,
    changed: attr(rootNode, 'changed') ?? undefined,
    origin: attr(rootNode, 'origin') ?? (fileVersion ? `Structorizer ${fileVersion}` : 'Structorizer (legacy NSD file)'),
    namespace: attr(rootNode, 'namespace') ?? undefined,
    licenseName: attr(rootNode, 'licenseName') ?? undefined,
    license: attr(rootNode, 'license') ?? undefined,
    fileVersion,
  };

  const diagram: Diagram = {
    id: newId(),
    diagramType: type === 'sub' ? 'sub' : type === 'includable' ? 'includable' : 'program',
    boxed: (attr(rootNode, 'style') ?? 'nice') === 'nice',
    text: decodeLines(attr(rootNode, 'text') ?? ''),
    comment: decodeLines(attr(rootNode, 'comment') ?? ''),
    color: hex(attr(rootNode, 'color')),
    includeList: includeRaw ? includeRaw.split(',').map((s) => s.trim()).filter((s) => s !== '') : [],
    keywords,
    meta,
    children: readSeq(first(rootNode, 'children')),
  };
  if (diagram.text.length === 0) diagram.text = ['???'];
  return { diagram, warnings };
}
