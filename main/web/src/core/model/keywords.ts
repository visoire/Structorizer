// SPDX-License-Identifier: GPL-3.0-or-later
import type { Keywords } from './types';

/** Defaults of Structorizer Desktop (parsers/CodeParser.java). */
export const DEFAULT_KEYWORDS: Readonly<Keywords> = Object.freeze({
  preAlt: '', postAlt: '',
  preCase: '', postCase: '',
  preFor: 'for', postFor: 'to', stepFor: 'by',
  preForIn: 'foreach', postForIn: 'in',
  preWhile: 'while', postWhile: '',
  preRepeat: 'until', postRepeat: '',
  preLeave: 'leave', preReturn: 'return', preExit: 'exit', preThrow: 'throw',
  input: 'INPUT', output: 'OUTPUT',
  ignoreCase: true,
});

export const KEYWORD_KEYS = [
  'preAlt', 'postAlt', 'preCase', 'postCase', 'preFor', 'postFor', 'stepFor',
  'preForIn', 'postForIn', 'preWhile', 'postWhile', 'preRepeat', 'postRepeat',
  'preLeave', 'preReturn', 'preExit', 'preThrow', 'input', 'output',
] as const satisfies readonly (keyof Omit<Keywords, 'ignoreCase'>)[];

/** The 10 element colours offered by the desktop (elements/Element.java defaultColors). */
export const DEFAULT_COLORS: readonly string[] = [
  'ffffff', 'ff8080', 'ffff80', '80ff80', '80ffff',
  '0080ff', 'ff80c0', 'c0c0c0', 'ff8000', '8080ff',
];
