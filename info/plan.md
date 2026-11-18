# plan.md – Structorizer Web, Implementation Plan

Implementation agents execute steps, tick boxes, and add a one-line note under a step
when something deviated. Status: **0.1.0 released locally on 2026-11-18** (Phase 0 and 1
implemented, see `../CHANGELOG.md`).

## How to work (implementation agent, read first)

1. Read in this order: `../docs/decisions.md`, `01-data-model.md`, then only the spec the
   current step names. Do not read `../sourcecode/` unless a step tells you to.
2. Do **one step at a time**, in order. A step is done when its "Done when" checks pass.
3. In `main/web/`: run `npm test`, `npm run typecheck` and `npm run build` before ticking a step.
4. Do not add dependencies, features or files outside the step. If a step is unclear
   or wrong, stop and write the question under the step (`> QUESTION: ...`).
5. No `eval`, no `new Function`, no network requests at runtime, no `crypto.randomUUID`.
6. Commit after every step (repository root `C:\xampp\htdocs\Structorizer`):
   `git commit -m "P2-01: tokenizer"`. Never push without the owner's go.
7. Add every user-visible change to `../CHANGELOG.md` under `[Unreleased]`.

Spec index: `../docs/source-analysis.md` (what the original does), `../docs/nsd-format.md`
(file format + fixture), `../docs/layout-spec.md` (shapes and sizes),
`../docs/decisions.md` (D-01 ... D-26), `../docs/issues-review.md` (desktop issues as
requirements), `01-data-model.md` (types and functions).

Code map (`main/web/src/`): `core/model` (types, ids, factory, tree, ops), `core/io`
(commaText, readNsd, writeNsd), `core/layout` (measure, layout, hit test), `core/render/svg.ts`,
`store/diagramStore.ts`, `ui/` (App, DiagramView, ElementEditor, exporters, icons),
`i18n/` (de, en), `examples/`.

---

## Phase 0 – Scaffold ✅

- [x] **P0-01 Create project.** Note: package.json written by hand (no template), React 19 (D-19), app in `main/web/` (D-20).
- [x] **P0-02 Folders.** Note: `core/lang`, `core/exec`, `core/gen` are created when Phase 2 starts.
- [x] **P0-03 Types.**
- [x] **P0-04 Factory.**
- [x] **P0-05 Tree helpers.**
- [x] **P0-06 Demo diagram.** Note: replaced by the bundled examples (`src/examples/`).

## Phase 1a – File format ✅

- [x] **P1-01 Comma text.**
- [x] **P1-02 Fixtures.**
- [x] **P1-03 Reader.** Note: returns `{ diagram, warnings }` (D-24).
- [x] **P1-04 Writer.**
- [ ] **P1-05 Manual desktop check.** Open a file saved by the web app in Structorizer Desktop 3.32 and note the result here. **Open: needs the owner** (Java desktop app).

## Phase 1b – Layout and rendering ✅

- [x] **P1-06 Text measure.**
- [x] **P1-07 .. P1-10 Layout of all elements.** Notes: layout emits a flat scene (rects, lines, texts, hits, gaps) instead of a box tree; CASE labels kept below the diagonal (columns widen as needed); IF condition placed like `Alternative.draw`; comment marks added.
- [x] **P1-11 SVG renderer.** Note: pure `sceneToSvg` (D-23). Visual check done in the browser against the desktop shapes, not yet side by side with a real desktop screenshot.
- [x] **P1-12 Zoom and fit.**

## Phase 1c – Editing ✅

- [x] **P1-13 Ops.**
- [x] **P1-14 Store.**
- [x] **P1-15 Selection** (tap, arrow keys incl. into/out of branches).
- [x] **P1-16 Toolbar insert** (+ "insert before" toggle for touch).
- [x] **P1-17 Edit dialog.**
- [x] **P1-18 Diagram properties.**
- [x] **P1-19 Copy / cut / paste / duplicate.**
- [x] **P1-20 Drag and drop.** Verified with the mouse. Long press on touch implemented, **not yet tested on a real iPad**.

## Phase 1d – Files, export, persistence ✅

- [x] **P1-21 Open/save.**
- [x] **P1-22 Autosave.** Note: stores the .nsd XML (not JSON) in `localStorage`.
- [x] **P1-23 Export SVG/PNG.**
- [x] **P1-24 i18n.**
- [x] **P1-25 Collapse.**

**MVP review gate (open):** the owner tests on an iPad (Safari) and a Windows browser.
Write the fix list below before Phase 2 starts.

> Fix list: _(empty)_

---

## Phase 1e – Small follow-ups (can run before or in parallel to Phase 2)

- [ ] **P1-26 PWA.** `public/manifest.webmanifest` (name, icons 192/512 PNG, `display: standalone`), a small service worker that precaches the build (no runtime caching of other origins). Done when: Chrome "Install app" works and the app opens offline.
- [ ] **P1-27 Context menu.** Long press / right click on an element opens a small sheet with edit, delete, copy, cut, paste, duplicate, disable, collapse (D-17 asks for a context sheet).
- [ ] **P1-28 Multi-selection.** Shift+↑/↓ extends the selection to a contiguous range in one sequence; delete/cut/copy/move work on the range (desktop key bindings).
- [ ] **P1-29 Branch head colours** (desktop 3.32-30): tap a branch triangle of IF/CASE to colour it; data model and file format already support it.
- [ ] **P1-30 Transmute** (Ctrl+T): change element type where sensible (instruction ↔ call ↔ jump, while ↔ repeat, merge/split instructions).
- [ ] **P1-31 Print** (Ctrl+P): print stylesheet that shows only the diagram.

## Phase 2 – Language and executor (specs follow before start)

The architect writes `../docs/language-spec.md` (grammar, operators, built-ins, types; must
cover desktop issues #980, #408, #530, #800, see `../docs/issues-review.md`) and
`../docs/executor-spec.md` (state machine, UI) before these steps begin.

- P2-01 Tokenizer (`core/lang/lexer.ts`), keyword-aware.
- P2-02 Expression parser (Pratt) to AST; operator table from source-analysis section 4.
- P2-03 Statement parser per instruction line: assignment, declaration, INPUT, OUTPUT, call, jump.
- P2-04 Values and built-ins (math, strings, arrays, records later), runtime errors with element id.
- P2-05 Executor as generator (`function*`, D-14) for all element kinds incl. leave/return/exit/throw/try.
- P2-06 Control panel UI: run, step, pause, stop, speed; highlight running element.
- P2-07 Variable watch, breakpoints, call stack.
- P2-08 Multi-diagram pool (open several, call subroutines by name + arity).
- P2-09 Runtime analysis overlay (execution counts, coverage).
- P2-10 Code export JavaScript + Python from the AST (D-15); tests from issues #725, #1238, #1232, #1210.

## Phase 3+ – see `04-roadmap.md`
