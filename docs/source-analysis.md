# Source Analysis: Structorizer Desktop 3.32-35

Analysed source: `sourcecode/Structorizer.Desktop-3.32-35/src/lu/fisch/structorizer/`
(Java 11, Swing). Analysis date: 2026-11-18.

This document tells the implementation agent **what the original does**. It does not
prescribe the web code; see `decisions.md`, `../01-data-model.md`, `nsd-format.md`,
`layout-spec.md` and `../plan.md` for that.

---

## 1. Package overview (Java lines of code)

| Package | Files | Lines | Role | Port priority |
|---|---|---|---|---|
| `elements/` | 25 | 26 400 | Data model **and** drawing **and** syntax analysis (everything mixed) | P0 (model + drawing) |
| `gui/` | 40 | 37 300 | Swing editor, menus, dialogs, `Diagram.java` (the canvas controller) | Reference only |
| `executor/` | 10 | 11 800 | Interpreter (`Executor.java` ~9 000 lines), control panel, output console | P2 |
| `generators/` | 23 | 38 900 | Code export: Pascal, Oberon, C, C++, C#, Java, JS, Python, PHP, Perl, BASH, KSH, BASIC, COBOL, ARM, LaTeX, PAP, **XmlGenerator = .nsd writer** | XmlGenerator P1, rest P1-P3 |
| `parsers/` | 14 | 30 800 | **NSDParser = .nsd reader** (SAX), source import via GOLD parser (C, Pascal, Java, COBOL, Processing), foreign NSD formats | NSDParser P1, rest out of scope |
| `arranger/` | 5 | 11 000 | Multi-diagram canvas, groups, .arr/.arrz | P3 |
| `archivar/` | 6 | 2 100 | Routine pool: find called subroutines by name + arity | P2 (simplified) |
| `io/` | 16 | 2 100 | File filters + `Ini.java` (preferences) | Not needed |
| `locales/` | 15 | 5 500 | i18n engine; strings in `locales/*.txt` (de, en, ...) | P4 (reuse de/en texts) |
| `../diagrcontrol`, `../turtle` | - | - | Diagram controllers (Turtleizer) callable from diagrams | P3 |

Key takeaway: the original has almost **no MVC separation**. `Element` subclasses hold
model fields, cached layout rectangles (`rect`, `rect0`), runtime state (`executed`,
`execCount`), selection state, static global preferences and Swing drawing code.
The web version must split these into: **model** (pure data), **layout** (pure function),
**render** (SVG), **runtime state** (executor-owned maps keyed by element id).

---

## 2. Element hierarchy

### 2.1 Inheritance (Java)

```
Element (abstract, 5 500 lines)
├── Root                 diagram itself (program / sub / includable)
├── Subqueue             sequence container (implements IElementSequence)
├── Instruction          one or more simple statement lines
│   ├── Call             subroutine call (same text, different shape)
│   └── Jump             leave / return / exit / throw
├── Alternative          IF (implements IFork)
├── Case                 CASE / switch (implements IFork)
├── Loop (abstract)      owns `protected Subqueue q` (the body)
│   ├── For              counter loop or for-in loop
│   ├── While            pre-test loop
│   ├── Repeat           post-test loop (until)
│   └── Forever          endless loop
├── Parallel             concurrent branches
└── Try                  try / catch / finally
```

### 2.2 Composition (what contains what)

| Class | Child containers | Notes |
|---|---|---|
| `Root` | `children: Subqueue` | exactly one top-level sequence |
| `Subqueue` | `children: Vector<Element>` | never contains another Subqueue directly |
| `Alternative` | `qTrue`, `qFalse` | both always exist (may be empty) |
| `Case` | `qs: Vector<Subqueue>` | count = `text lines - 1`, minimum 2 |
| `For`, `While`, `Repeat`, `Forever` | `q` (body) | via `Loop` |
| `Parallel` | `qs: Vector<Subqueue>` | count = integer in text line 0 |
| `Try` | `qTry`, `qCatch`, `qFinally` | finally may be hidden when empty |
| `Instruction`, `Call`, `Jump` | none | leaves |

Every element has `parent` (back-reference). Subqueue `parent` is the owning
structured element.

### 2.3 Persistent fields common to all elements (`Element.java`)

| Field | Type | Persisted in .nsd | Meaning |
|---|---|---|---|
| `text` | `StringList` (list of lines) | yes (`text`) | main content; meaning depends on type (see 2.4) |
| `comment` | `StringList` | yes (`comment`) | free comment, shown as tooltip or in "comments plus text" mode |
| `color` | `Color` (default white) | yes (`color`, hex `rrggbb`, no `#`) | background tint |
| `disabled` | boolean | yes (`disabled="1"`) | executor skips, generators comment it out, drawn hatched |
| `rotated` | boolean | written as `rotated="0"` always | legacy, ignore |
| `collapsed` | boolean | **no** | UI only, shows text + "..." |
| `breakpoint` | boolean | **no** | executor only |
| `breakTriggerCount` | int | **no** | conditional breakpoint (pause on n-th pass) |
| `id` | long counter | **no** | runtime identity |

Runtime-only: `selected`, `executed`, `waited`, `simplyCovered`, `deeplyCovered`,
`execCount`, `execStepCount`, `execSubCount`, `rect`, `rect0`, `topLeft`,
`highlightCache`.

### 2.4 Meaning of `text` per element type

| Type | Text lines | Example |
|---|---|---|
| Root | line 0 = name or signature; more lines allowed | `hilbert(size: int; level: int; parity: int)` |
| Instruction | each line is one statement | `x <- 5`, `INPUT a`, `OUTPUT "sum: ", s`, `var n: int`, `const PI <- 3.14`, `type Point = record{x: int; y: int}` |
| Call | usually 1 line: a procedure or function call, optionally with assignment | `hilbert(size, level - 1, -parity)`, `r <- fact(n - 1)` |
| Jump | 0 or 1 line | empty or `leave` / `leave 2`, `return x`, `exit 1`, `throw "msg"` |
| Alternative | condition (may span several lines) | `level = 0` |
| Case | line 0 = discriminator; lines 1..n-1 = selectors (comma-separated constants per line); last line = default label, or `%` meaning "no default branch shown" | `x`, `1`, `2, 3`, `default` |
| For | header text | `for i <- 1 to 10 by 2`, `foreach v in {1,2,3}` |
| While | condition with optional keyword | `while (i < 10)` |
| Repeat | exit condition | `until (i >= 10)` |
| Forever | not used (not even saved) | |
| Parallel | line 0 = number of branches | `3` |
| Try | catch variable name (line 0) | `ex` |

**Line continuation:** a line ending with `\` continues on the next line
("broken text"). `getUnbrokenText()` joins them. Matters for Case and Jump checks.
MVP may ignore it but must not crash on it.

### 2.5 Type-specific persistent fields

| Class | Field | Notes |
|---|---|---|
| Root | `diagrType` | `DT_MAIN` (`type="program"`), `DT_SUB` (`type="sub"`), `DT_INCL` (`type="includable"`) |
| Root | `isBoxed` | `style="nice"` (boxed) vs `"abbr"` |
| Root | `includeList` | names of includable diagrams (shared declarations) |
| Root | `author`, `created`, `modifiedby`, `modified`, `origin`, `licenseName`, `licenseText`, `namespace` | metadata |
| Root | `storedParserPrefs` | keyword set the file was saved with (`preFor="for"` ...) |
| For | `style` | `FREETEXT`, `COUNTER`, `TRAVERSAL` |
| For | `counterVar`, `startValue`, `endValue`, `stepConst` (int), `valueList` | structured clause; derived from text if missing |
| Call | `isMethodDeclaration` | Java import artefact, keep for round trip only |
| Alternative, Case | branch head colors | `branch_colors` attr, per branch hex list (since 3.32-30) |

### 2.6 Keywords ("parser preferences")

Keywords are **user-configurable** and stored per file. Defaults (`CodeParser.java:1645`):

| Key | Default | Key | Default |
|---|---|---|---|
| preAlt / postAlt | "" / "" | preWhile / postWhile | `while` / "" |
| preCase / postCase | "" / "" | preRepeat / postRepeat | `until` / "" |
| preFor / postFor / stepFor | `for` / `to` / `by` | preLeave | `leave` |
| preForIn / postForIn | `foreach` / `in` | preReturn | `return` |
| input / output | `INPUT` / `OUTPUT` | preExit / preThrow | `exit` / `throw` |

Files often carry other values (e.g. `preAlt="if"`, `stepFor="step"`). The web
version stores the keyword set per diagram and uses it when parsing text.

---

## 3. How drawing / layout works (original)

Two passes per element, cached:

1. `prepareDraw(Canvas)` computes the element's **own size** `rect0` (0-based) from
   text metrics and the sizes of its children (bottom-up recursion). Cached by
   `isRect0UpToDate`, invalidated by `resetDrawingInfoUp()` on any change.
2. `draw(Canvas, Rect topLeft, viewport)` paints into the rectangle the **parent
   assigns**. Parents may give a child more width than it asked for (Subqueue
   stretches every child to its own width; the last child of a branch is stretched
   down to the branch bottom).

Global constants: `E_PADDING = 20` px, font "Dialog" 12 pt, Root corner radius 15.
All formulas are in `layout-spec.md`.

Hit testing: `getElementByCoord(x, y)` walks down using the cached rectangles.

Visual extras (later phases): variable highlighting (colours per token class),
Analyser warning triangle (red corner), runtime overlays (execution counts,
coverage green), hatched disabled elements, comment popups.

---

## 4. How the executor works (original)

- `Executor.java` runs in a separate thread. `step(Element)` dispatches by type to
  `stepInstruction`, `stepCall`, `stepJump`, `stepAlternative`, `stepCase`,
  `stepWhile` (also Forever), `stepRepeat`, `stepFor`, `stepForIn`, `stepParallel`,
  `stepTry`. Returns an error string ("trouble"); empty means success.
- **Expression evaluation is delegated to BeanShell** (a Java interpreter). Each line
  is text-converted first (`convert()`): tokenise, `:=` to `<-`, `=` to `==`, `<>` to
  `!=`, `mod` `%`, `div` `/`, `and` `&&`, `or` `||`, `not` `!`, `xor` `^`, `shl/shr`,
  math function names prefixed `Math.`, Pascal string procedures rewritten,
  `inc(x)`/`dec(x)` rewritten.
  **The web version cannot use BeanShell and must not use `eval`.** It needs its own
  tokenizer + parser + evaluator for the Structorizer expression language.
- Control: delay slider, step mode, pause, stop, breakpoints, "trigger count"
  breakpoints, call stack display, variable table (editable while paused).
- Disabled elements are skipped. Breakpoint switches to step mode before the element
  runs (Repeat loops check at the end).
- `Jump`: `leave [n]` exits n loop levels, `return [expr]` ends the routine,
  `exit [code]` ends the program, `throw expr` raises (caught by Try).
- `Parallel`: not real concurrency. Each branch is an iterator; the executor picks
  a **random** unfinished branch and runs its next top-level element until all are
  done. `leave` must not cross a Parallel boundary.
- `Call`: resolves the subroutine by **name and argument count** via the Arranger /
  routine pool (`archivar`), then runs it recursively with a new variable context.
- Runtime analysis: execution counts and test coverage are stored on the elements.
- Input/output: `INPUT x` opens a dialog, `OUTPUT ...` writes to a dialog or an
  output console window.
- Turtleizer: built-in diagram controller; instructions like `forward(50)`,
  `left(90)` are routed to it (`lu.fisch.diagrcontrol`).

---

## 5. Code generators (original)

Base class `Generator.java` (visitor-like `generateCode(ElementType, indent)` per
element type). Two-phase translation:

1. `Element.transformIntermediate()` turns each text line into a normalised
   intermediate syntax (assignment ` <- `, comparisons ` = ` / ` <> `, logic ` && `,
   ` || `, ` §NOT§ `, keywords stripped from conditions).
2. Each language generator maps the intermediate form to its syntax.

The maintainers themselves call the generator code "slowly grown hay-wire felt"
(see `sourcecode/info.txt`). **Do not port it.** Write fresh generators on top of the
web expression parser (AST based), starting with JavaScript and Python.

---

## 6. .nsd file format

XML, UTF-8, written by `XmlGenerator.java`, read by `NSDParser.java` (SAX).
Full specification with a test fixture: `nsd-format.md`.

---

## 7. Technical debt and traps in the original (do not copy)

1. Model, layout cache, runtime state and Swing code in one class (Element 5 500 lines, Root 8 000).
2. Static global preferences (`Element.E_*`) read everywhere.
3. Undo/redo = full copies of the Root's Subqueue on a stack. (Acceptable for the web MVP too, but via immutable snapshots.)
4. Structure depends on text: Case branch count = text lines - 1, Parallel branch count = number in text line 0. Editing text silently adds or removes branches. The web model must make this explicit (see `decisions.md` D-05).
5. For loop has text **and** structured fields that can disagree; `style` decides which is trusted.
6. Keyword sets are global but files carry their own; the original "refactors" texts on load. Web: keep keywords per diagram, no global refactoring.
7. Expression language is defined implicitly by text conversion for BeanShell. The web version needs an explicit grammar (`plan.md` step P2).
8. No real concurrency in Parallel (random interleaving). Keep that behaviour; it is what users know.

---

## 8. Existing material in this folder

| File | Content | Status |
|---|---|---|
| `grok.txt` | Feasibility study + phase plan (German) | Input, superseded by `plan.md` + `04-roadmap.md` |
| `sourcecode/info.txt` | GitHub issue #1244 (iPad / browser version wanted), maintainer view | Context: target users are school classes on iPads |
| `sourcecode/issues*.txt` | Open desktop issues (61 open) | Mostly export/import bugs, not relevant for MVP |
| `sourcecode/gdpr.txt` | Original privacy statement | Our version: no server data at all |
| `sourcecode/changelog.txt` | Desktop changelog | Reference only |
| `00-AGENT-PROMPT.md` ... `04-roadmap.md` | Initial agent briefs | Updated, see `plan.md` |
