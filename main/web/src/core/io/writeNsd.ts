// SPDX-License-Identifier: GPL-3.0-or-later
// Writer for Structorizer .nsd files, compatible with Structorizer Desktop 3.32 (docs/nsd-format.md section 6).
import { KEYWORD_KEYS } from '../model/keywords';
import type { Diagram, Element } from '../model/types';
import { encodeLines } from './commaText';

/** Version written into files so the desktop reads them on its modern path (D-08). */
export const NSD_VERSION = '3.32-35';

export function xmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&#34;')
    .replace(/\r?\n/g, '&#10;')
    .replace(/\t/g, '&#9;');
}

const a = (name: string, value: string) => ` ${name}="${xmlAttr(value)}"`;
const lines = (name: string, value: string[]) => a(name, encodeLines(value));
const dis = (el: Element) => a('disabled', el.disabled ? '1' : '0');

function branchColors(list: string[] | undefined, n: number): string {
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(list?.[i] ?? '');
  return a('branch_colors', out.join(','));
}

export function writeNsd(d: Diagram, appVersion = '0.0.0'): string {
  const out: string[] = [];
  const seq = (tag: string, els: Element[], indent: string) => {
    out.push(`${indent}<${tag}>`);
    for (const el of els) element(el, indent + '\t');
    out.push(`${indent}</${tag}>`);
  };
  const element = (el: Element, ind: string) => {
    const head = lines('text', el.text) + lines('comment', el.comment) + a('color', el.color);
    const sub = ind + '\t';
    switch (el.kind) {
      case 'instruction':
        out.push(`${ind}<instruction${head}${a('rotated', '0')}${dis(el)}></instruction>`);
        break;
      case 'call':
        out.push(`${ind}<call${head}${dis(el)}${a('ismethoddecl', el.isMethodDeclaration ? '1' : '0')}></call>`);
        break;
      case 'jump':
        out.push(`${ind}<jump${head}${dis(el)}></jump>`);
        break;
      case 'alternative':
        out.push(`${ind}<alternative${head}${branchColors(el.branchHeadColors, 2)}${dis(el)}>`);
        seq('qTrue', el.thenBranch, sub);
        seq('qFalse', el.elseBranch, sub);
        out.push(`${ind}</alternative>`);
        break;
      case 'case':
        out.push(`${ind}<case${head}${branchColors(el.branchHeadColors, el.branches.length)}${dis(el)}>`);
        for (const b of el.branches) seq('qCase', b, sub);
        out.push(`${ind}</case>`);
        break;
      case 'for': {
        let extra = '';
        if (el.counterVar !== undefined) extra += a('counterVar', el.counterVar);
        if (el.startValue !== undefined) extra += a('startValue', el.startValue);
        if (el.endValue !== undefined) extra += a('endValue', el.endValue);
        if (el.stepConst !== undefined) extra += a('stepConst', String(el.stepConst));
        extra += a('style', el.style);
        if (el.style === 'TRAVERSAL') extra += a('insep', d.keywords.postForIn);
        out.push(`${ind}<for${lines('text', el.text)}${lines('comment', el.comment)}${extra}${a('color', el.color)}${dis(el)}>`);
        seq('qFor', el.body, sub);
        out.push(`${ind}</for>`);
        break;
      }
      case 'while':
        out.push(`${ind}<while${head}${dis(el)}>`);
        seq('qWhile', el.body, sub);
        out.push(`${ind}</while>`);
        break;
      case 'repeat':
        out.push(`${ind}<repeat${head}${dis(el)}>`);
        seq('qRepeat', el.body, sub);
        out.push(`${ind}</repeat>`);
        break;
      case 'forever':
        out.push(`${ind}<forever${lines('comment', el.comment)}${a('color', el.color)}${dis(el)}>`);
        seq('qForever', el.body, sub);
        out.push(`${ind}</forever>`);
        break;
      case 'parallel':
        out.push(`${ind}<parallel${lines('text', [String(el.branches.length)])}${lines('comment', el.comment)}${a('color', el.color)}${dis(el)}>`);
        for (const b of el.branches) seq('qPara', b, sub);
        out.push(`${ind}</parallel>`);
        break;
      case 'try':
        out.push(`${ind}<try${head}${dis(el)}>`);
        seq('qTry', el.tryBody, sub);
        seq('qCatch', el.catchBody, sub);
        seq('qFinally', el.finallyBody, sub);
        out.push(`${ind}</try>`);
        break;
    }
  };

  let rootAttrs = a('xmlns:nsd', 'https://structorizer.fisch.lu') + a('version', NSD_VERSION);
  for (const key of KEYWORD_KEYS) rootAttrs += a(key, d.keywords[key]);
  rootAttrs += a('ignoreCase', String(d.keywords.ignoreCase));
  if (d.includeList.length > 0) rootAttrs += a('includeList', d.includeList.join(','));
  const m = d.meta;
  if (m.namespace !== undefined) rootAttrs += a('namespace', m.namespace);
  if (m.author) rootAttrs += a('author', m.author);
  if (m.created) rootAttrs += a('created', m.created);
  if (m.changedBy) rootAttrs += a('changedby', m.changedBy);
  if (m.changed) rootAttrs += a('changed', m.changed);
  rootAttrs += a('origin', m.origin && !m.origin.startsWith('Structorizer Web') ? m.origin : `Structorizer Web ${appVersion}`);
  if (m.licenseName) rootAttrs += a('licenseName', m.licenseName);
  if (m.license) rootAttrs += a('license', m.license);
  rootAttrs += lines('text', d.text) + lines('comment', d.comment) + a('color', d.color);
  rootAttrs += a('type', d.diagramType) + a('style', d.boxed ? 'nice' : 'abbr');

  out.push('<?xml version="1.0" encoding="UTF-8"?>');
  out.push(`<root${rootAttrs}>`);
  seq('children', d.children, '\t');
  out.push('</root>');
  return out.join('\n') + '\n';
}

/** File name suggestion: diagram name up to the first '(' or blank. */
export function suggestFileName(d: Diagram): string {
  const name = (d.text[0] ?? '').split(/[\s(:]/)[0].replace(/[^\w.-]/g, '_');
  return (name && name !== '???' ? name : 'diagram') + '.nsd';
}
