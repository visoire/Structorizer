# 01 – Data Model & TypeScript Interfaces

Status: **final for Phase 0/1** (revised 2026-11-18 after source analysis).
Background: `docs/source-analysis.md` section 2, file mapping: `docs/nsd-format.md`.
Decisions referenced: `docs/decisions.md` (D-04 ... D-07).

## Changes against the first draft

- `text` is `string[]` (lines), not `string` (D-04).
- `RootElement` is not part of the `Element` union; a diagram is a separate `Diagram` type.
- Case keeps the original encoding (selectors live in `text`), plus helpers.
- For gets `style` and structured clause fields; Try gets `finallyBody`.
- Added `collapsed` (UI) and per-branch head colors; `breakpoint` and runtime data
  moved out of the model (they are not saved in .nsd).
- Removed `'subqueue'` from the element types: a sequence is `Element[]`.

## Interfaces (copy into `main/web/src/core/model/types.ts`)

```ts
export type Hex = string; // 6 hex digits, lowercase, no '#', e.g. "ffffff"

export type ElementKind =
  | 'instruction' | 'call' | 'jump'
  | 'alternative' | 'case'
  | 'for' | 'while' | 'repeat' | 'forever'
  | 'parallel' | 'try';

interface ElementBase {
  id: string;            // newId(), never persisted
  kind: ElementKind;
  text: string[];        // lines; meaning per kind, see table below
  comment: string[];
  color: Hex;            // default "ffffff"
  disabled: boolean;
  collapsed?: boolean;   // UI only, not persisted
}

export interface Instruction extends ElementBase { kind: 'instruction' }
export interface Call        extends ElementBase { kind: 'call'; isMethodDeclaration?: boolean }
export interface Jump        extends ElementBase { kind: 'jump' }

export interface Alternative extends ElementBase {
  kind: 'alternative';
  thenBranch: Element[];
  elseBranch: Element[];
  branchHeadColors?: [Hex | '', Hex | ''];
}

export interface Case extends ElementBase {
  kind: 'case';
  // text[0] = discriminator, text[1..k-1] = selectors, text[k] = default label or '%'
  branches: Element[][];          // length === text.length - 1, >= 2
  branchHeadColors?: (Hex | '')[];
}

export type ForStyle = 'FREETEXT' | 'COUNTER' | 'TRAVERSAL';
export interface For extends ElementBase {
  kind: 'for';
  style: ForStyle;
  counterVar?: string;
  startValue?: string;
  endValue?: string;
  stepConst?: number;   // integer, default 1
  body: Element[];
}

export interface While   extends ElementBase { kind: 'while';   body: Element[] }
export interface Repeat  extends ElementBase { kind: 'repeat';  body: Element[] }
export interface Forever extends ElementBase { kind: 'forever'; body: Element[] } // text always []

export interface Parallel extends ElementBase {
  kind: 'parallel';
  // text[0] = String(branches.length)
  branches: Element[][];          // >= 1
}

export interface Try extends ElementBase {
  kind: 'try';
  // text[0] = name of the catch variable (may be '')
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
  fileVersion?: string; // read only
}

export interface Diagram {
  id: string;
  diagramType: DiagramType;
  boxed: boolean;          // style="nice"
  text: string[];          // name or signature, e.g. ["fact(n: int): int"]
  comment: string[];
  color: Hex;
  includeList: string[];
  keywords: Keywords;
  meta: DiagramMeta;
  children: Element[];
}
```

## Address of a position (for insert / move / delete)

Edits address places in the tree, not object references:

```ts
// Which sequence: the diagram body or a named branch of an element.
export type SeqRef =
  | { owner: 'root' }
  | { owner: string /* element id */; slot: 'then' | 'else' | 'body' | 'try' | 'catch' | 'finally' }
  | { owner: string; slot: 'branch'; index: number };   // case / parallel

export interface Position { seq: SeqRef; index: number } // insert before index
```

## Required pure functions (`main/web/src/core/model/`)

| Function | File | Contract |
|---|---|---|
| `newId(): string` | `ids.ts` | D-06 |
| `DEFAULT_KEYWORDS` | `keywords.ts` | values from source-analysis 2.6 |
| `createElement(kind, text?): Element` | `factory.ts` | sensible defaults: case `["x","1","2","default"]` with 3 empty branches, parallel `["2"]` with 2, for `["for i <- 1 to 10"]` style `COUNTER` etc. Texts use current keywords. |
| `createDiagram(type): Diagram` | `factory.ts` | text `["NewDiagram"]` (program) / `["sub()"]` |
| `getSeq(d, ref): Element[]` | `tree.ts` | throws on invalid ref |
| `findById(d, id): {el, parentSeq, index} \| null` | `tree.ts` | |
| `walk(d, fn)` | `tree.ts` | pre-order over all elements incl. nested |
| `insertAt(d, pos, el): Diagram` | `ops.ts` | returns new diagram, input untouched |
| `removeById(d, id): Diagram` | `ops.ts` | |
| `moveTo(d, id, pos): Diagram` | `ops.ts` | refuse moving into own subtree |
| `updateElement(d, id, patch): Diagram` | `ops.ts` | applies D-05 when text of case/parallel changes |
| `setCaseText(el, text)` / `setParallelCount(el, n)` | `ops.ts` | D-05 |
| `cloneWithNewIds(el): Element` | `ops.ts` | for copy/paste and duplicate |
| `countElements(d): number` | `tree.ts` | used by tests |

All ops are immutable (return new objects along the changed path only).

## Mapping table (Java -> TypeScript)

| Java | TS | Notes |
|---|---|---|
| `Root` | `Diagram` | |
| `Root.children` (Subqueue) | `Diagram.children` | |
| `Subqueue` | `Element[]` | color of empty subqueue dropped (D-07) |
| `Instruction` / `Call` / `Jump` | `Instruction` / `Call` / `Jump` | |
| `Alternative.qTrue` / `qFalse` | `thenBranch` / `elseBranch` | |
| `Case.qs` | `Case.branches` | |
| `Loop.q` | `body` | |
| `Parallel.qs` | `Parallel.branches` | |
| `Try.qTry/qCatch/qFinally` | `tryBody/catchBody/finallyBody` | |
| `Element.breakpoint`, `execCount`, coverage | `RuntimeState` in executor (phase 2), keyed by id | not part of the model |
