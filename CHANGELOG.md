# Changelog – Structorizer Web

All notable changes to the **web version** are documented here. The desktop version
has its own changelog (`sourcecode/changelog.txt`, not part of this repository).

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versions follow
[Semantic Versioning](https://semver.org/). Desktop issue numbers refer to
[fesch/Structorizer.Desktop](https://github.com/fesch/Structorizer.Desktop/issues).

## [Unreleased]

## [0.1.0] – 2026-11-18

First basic web version (Phase 0 and 1 of `plan.md`): a working Nassi-Shneiderman
editor that runs completely in the browser and exchanges files with Structorizer Desktop.

### Added
- **Diagram editor** for all 11 element types of Structorizer Desktop: Instruction, Call,
  Exit (Jump), IF, CASE, FOR (counter and traversal), WHILE, REPEAT, endless loop,
  Parallel and TRY (with catch and optional finally).
- Diagram types program, subroutine and includable, with the desktop frame shapes
  (rectangle, rounded corners, two bevelled corners) and the include list box.
- **.nsd files**: open and save in the Structorizer Desktop XML format (version 3.32),
  including keywords, metadata, license info, colours, branch head colours, disabled
  state and FOR loop attributes. Round trip tested with a fixture covering every element
  type and with the desktop sample `hilbert-3.nsd`. Inconsistent CASE elements are
  repaired with a warning instead of failing.
- Layout ported from the desktop drawing code: IF header width and condition placement,
  CASE diagonal with selector labels kept below it (`%` hides the default branch),
  loop bars, Parallel corner marks, TRY sections, comment marks, hatched disabled elements,
  collapsed elements, assignment and comparison operators shown as ←, ≤, ≥, ≠.
- Editing: insert after or before (Shift, or the "insert before" toggle on touch devices),
  element editor with text, comment, the 10 desktop colours and "disabled",
  diagram editor (name/signature, comment, type, frame, author, include list, colour),
  delete, cut, copy, paste, duplicate, move up/down, disable/enable, collapse/expand.
- Undo/redo (100 steps). Inserting and the first edit form one undo step; cancelling the
  editor of a new element removes it again.
- Drag and drop with mouse, and with long press on touch screens; drop indicator; moving
  an element into itself is refused.
- Pinch zoom, zoom buttons (30 to 300 %), "fit to window".
- Desktop keyboard shortcuts: F5 to F12 and Ctrl+F5/F6/F7 insert elements (Shift: before),
  Enter edit, Del delete, Ctrl+↑/↓ move, arrow keys select, Ctrl+7 disable,
  Numpad −/+ collapse, Ctrl+Z/Y, Ctrl+C/X/V, Shift+Del, Shift+Ins, Ctrl+S, Ctrl+O, Ctrl+E.
- Export as SVG and PNG (2x resolution); screen and export use the same renderer.
- Autosave of the current diagram in the browser (`localStorage`), restored on start.
- File System Access API for "Save" on Chromium browsers; download fallback elsewhere
  (Safari, Firefox, iPad).
- Three bundled examples (temperature table, all elements, desktop sample hilbert).
- German and English user interface, switchable, default from the browser language.
- Touch-first layout: 44 px targets, phone and tablet layout, safe areas for iPad/iPhone.
- 27 unit tests (model, .nsd reader/writer, layout, store).

### Privacy and openness
- No server component, no cookies, no analytics, no external fonts or CDNs.
- The production build sets a Content Security Policy with `connect-src 'none'`, so the
  app cannot send data anywhere even by mistake.
- Licensed under GPL-3.0-or-later, like Structorizer Desktop.

### Improvements over desktop issues
- #1244 (iPad / browser version): this project. Runs in Safari on iPad without installation.
- #1243, #1133, #986 (DPI scaling, invisible menu check marks, Look & Feel glitches):
  not applicable, the web UI uses vector graphics and explicit toggle states.
- #401 (dialogs cannot be closed by keyboard): every dialog closes with Esc;
  Shift+Enter or Ctrl+Enter confirms.
- #393 (sample files): example diagrams are bundled in the app.
- #714 (TRY): an empty finally block is hidden by default, as in current desktop versions.
- #1240, #871, #676, #1045, #602 (packaging, installer, package repositories, native
  image, executable scripts): not needed, the app is a static folder that runs in any
  current browser and can be hosted on any web server.
- #311, #1016 (menu organisation): one file menu plus a single toolbar.
- Full review of all listed issues: `docs/issues-review.md`.

### Not yet included (planned, see `plan.md` and `04-roadmap.md`)
- Executor / debugger, Turtleizer, Analyser, code export and import, Arranger,
  multiple open diagrams, find and replace, PWA offline install.
