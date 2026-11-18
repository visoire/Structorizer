// Data model of Structorizer Web. See 01-data-model.md.
// SPDX-License-Identifier: GPL-3.0-or-later

/** 6 hex digits, lowercase, no '#', e.g. "ffffff". */
export type Hex = string;

export type ElementKind =
  | 'instruction' | 'call' | 'jump'
  | 'alternative' | 'case'
  | 'for' | 'while' | 'repeat' | 'forever'
  | 'parallel' | 'try';

interface ElementBase {
  /** Runtime identity, never persisted. */
  id: string;
  kind: ElementKind;
  /** Text lines; meaning depends on the kind (docs/source-analysis.md 2.4). */
  text: string[];
  comment: string[];
  color: Hex;
  disabled: boolean;
  /** UI only, not persisted. */
  collapsed?: boolean;
}

export interface Instruction extends ElementBase { kind: 'instruction' }
export interface Call extends ElementBase { kind: 'call'; isMethodDeclaration?: boolean }
export interface Jump extends ElementBase { kind: 'jump' }

export interface Alternative extends ElementBase {
  kind: 'alternative';
  thenBranch: Element[];
  elseBranch: Element[];
  branchHeadColors?: (Hex | '')[];
}

export interface Case extends ElementBase {
  kind: 'case';
  /** text[0] discriminator, text[1..k-1] selectors, text[k] default label or '%'. */
  branches: Element[][];
  branchHeadColors?: (Hex | '')[];
}

export type ForStyle = 'FREETEXT' | 'COUNTER' | 'TRAVERSAL';

export interface For extends ElementBase {
  kind: 'for';
  style: ForStyle;
  counterVar?: string;
  startValue?: string;
  endValue?: string;
  stepConst?: number;
  body: Element[];
}

export interface While extends ElementBase { kind: 'while'; body: Element[] }
export interface Repeat extends ElementBase { kind: 'repeat'; body: Element[] }
export interface Forever extends ElementBase { kind: 'forever'; body: Element[] }

export interface Parallel extends ElementBase {
  kind: 'parallel';
  /** text[0] = String(branches.length). */
  branches: Element[][];
}

export interface Try extends ElementBase {
  kind: 'try';
  /** text[0] = name of the catch variable (may be ''). */
  tryBody: Element[];
  catchBody: Element[];
  finallyBody: Element[];
}

export type Element =
  | Instruction | Call | Jump | Alternative | Case
  | For | While | Repeat | Forever | Parallel | Try;

export type DiagramType = 'program' | 'sub' | 'includable';

export interface Keywords {
  preAlt: string; postAlt: string; preCase: string; postCase: string;
  preFor: string; postFor: string; stepFor: string;
  preForIn: string; postForIn: string;
  preWhile: string; postWhile: string; preRepeat: string; postRepeat: string;
  preLeave: string; preReturn: string; preExit: string; preThrow: string;
  input: string; output: string;
  ignoreCase: boolean;
}

export interface DiagramMeta {
  author?: string; created?: string; changedBy?: string; changed?: string;
  origin?: string; namespace?: string; licenseName?: string; license?: string;
  /** Version of the program that wrote the file (read only). */
  fileVersion?: string;
}

export interface Diagram {
  id: string;
  diagramType: DiagramType;
  boxed: boolean;
  text: string[];
  comment: string[];
  color: Hex;
  includeList: string[];
  keywords: Keywords;
  meta: DiagramMeta;
  children: Element[];
}

/** Address of a sequence: the diagram body or a branch slot of an element. */
export type SeqRef =
  | { owner: 'root' }
  | { owner: string; slot: 'then' | 'else' | 'body' | 'try' | 'catch' | 'finally' }
  | { owner: string; slot: 'branch'; index: number };

/** Insert before `index` in the sequence `seq`. */
export interface Position { seq: SeqRef; index: number }

export const STRUCTURED_KINDS: ReadonlySet<ElementKind> = new Set<ElementKind>([
  'alternative', 'case', 'for', 'while', 'repeat', 'forever', 'parallel', 'try',
]);
